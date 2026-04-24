// POST /api/order/submit — Bayar di Kasir order intake.
//
// Two paths depending on tenant.pos_provider:
//
//   esb          → submit to ESB /qsv1/order/qrData, persist with
//                  esb_order_id + payment_qr_string, fire WhatsApp stub.
//
//   sajian_native → skip ESB entirely, persist directly to public.orders,
//                   fire WhatsApp stub. The order shows up on /admin via
//                   Supabase Realtime. Owner marks it paid/ready/etc. from
//                   the dashboard.
//
// Online payments (Xendit, QRIS, etc.) are Phase 2 — both paths only accept
// `paymentMethod === 'cashier'` for now.

import { NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/api/tenant-api';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { submitOrderSchema, isDigital } from '@/lib/order/schema';
import { toESBCashierPayload } from '@/lib/order/esb-mapper';
import { ESBClient, visitPurposeFor } from '@/lib/esb/client';
import type { ESBBranchSettings } from '@/lib/esb/types';
import { sendWhatsApp } from '@/lib/notify/whatsapp';
import { channelFor, checkoutUrl, createEWalletCharge, createQRIS } from '@/lib/payments/xendit';

interface ESBCashierEnvelope {
  data?: { orderID?: string; qrData?: string; queueNum?: string };
  orderID?: string;
  qrData?: string;
  queueNum?: string;
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = submitOrderSchema.safeParse(json);
    if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    const body = parsed.data;

    const tenant = await resolveTenant();
    if (!tenant.is_active) {
      return badRequest('Toko sedang offline. Coba lagi nanti.');
    }
    const supabase = createServiceClient();

    const subtotal = body.items.reduce((sum, item) => {
      const mods = item.modifiers.reduce((s, m) => s + m.priceDelta, 0);
      return sum + (item.price + mods) * item.quantity;
    }, 0);

    const { data: customer } = await supabase
      .from('customers')
      .upsert(
        {
          tenant_id: tenant.id,
          phone: body.customerPhone,
          name: body.customerName,
        },
        { onConflict: 'tenant_id,phone' },
      )
      .select('id')
      .single();

    const branchRow = await supabase
      .from('branches')
      .select('name')
      .eq('tenant_id', tenant.id)
      .eq('code', body.branchCode)
      .maybeSingle();

    // ── ESB path ──────────────────────────────────────────────────────────
    if (tenant.pos_provider === 'esb') {
      const esb = new ESBClient(tenant);

      const settingsRaw = (await esb.getBranchSettings(body.branchCode)) as
        | ESBBranchSettings
        | { data?: ESBBranchSettings };
      const settings: ESBBranchSettings =
        'data' in settingsRaw && settingsRaw.data ? settingsRaw.data : (settingsRaw as ESBBranchSettings);

      const visitPurposeID = visitPurposeFor(settings, body.orderType);
      if (!visitPurposeID) {
        return badRequest(`Branch ${body.branchCode} does not support ${body.orderType}`);
      }

      const lat = settings.latitude;
      const lng = settings.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.error(
          `[order/submit] branch ${body.branchCode} missing coords in ESB settings`,
        );
        return NextResponse.json(
          { error: 'Pesanan gagal diproses. Coba cabang lain atau hubungi support.' },
          { status: 502 },
        );
      }

      const esbPayload = toESBCashierPayload(body, visitPurposeID, lat, lng);
      const esbResponse = (await esb.submitCashierOrder(body.branchCode, esbPayload)) as ESBCashierEnvelope;
      const esbOrderId = esbResponse.orderID ?? esbResponse.data?.orderID;
      const qrData = esbResponse.qrData ?? esbResponse.data?.qrData;
      const queueNum = esbResponse.queueNum ?? esbResponse.data?.queueNum ?? null;

      if (!esbOrderId || !qrData) {
        // Log the full response server-side for debugging; never echo it to
        // the client — ESB sometimes returns stack traces in error bodies.
        console.error(
          '[order/submit] ESB did not return qrData/orderID:',
          JSON.stringify(esbResponse).slice(0, 2000),
        );
        return NextResponse.json(
          { error: 'Pesanan gagal diproses di POS. Coba lagi.' },
          { status: 502 },
        );
      }

      const { data: orderNumber } = await supabase.rpc('generate_order_number', {
        p_tenant_id: tenant.id,
        p_branch_code: body.branchCode,
      });

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant.id,
          order_number: orderNumber ?? queueNum ?? esbOrderId,
          customer_id: customer?.id,
          customer_name: body.customerName,
          customer_phone: body.customerPhone,
          items: body.items,
          subtotal,
          total: subtotal,
          order_type: body.orderType,
          table_number: body.tableNumber ?? null,
          delivery_address: body.deliveryAddress ?? null,
          payment_method: 'cashier',
          payment_status: 'pending',
          payment_qr_string: qrData,
          esb_order_id: esbOrderId,
          pos_pushed: true,
          status: 'new',
          branch_code: body.branchCode,
          branch_name: branchRow.data?.name ?? body.branchCode,
          customer_notes: body.customerNotes ?? null,
        })
        .select('*')
        .single();

      if (error) {
        console.error('[order/submit] Supabase insert failed, ESB order already created:', error);
        return NextResponse.json(
          {
            orderId: null,
            esbOrderId,
            qrData,
            queueNumber: queueNum,
            warning: 'Order placed at POS but local record failed. Contact support with orderID.',
          },
          { status: 200 },
        );
      }

      sendWhatsApp({
        phone: body.customerPhone,
        template: 'order_received',
        data: {
          orderNumber: order.order_number,
          branch: order.branch_name,
          total: subtotal,
        },
      }).catch((err) => console.error('[order/submit] WA notify failed:', err));

      return NextResponse.json({
        orderId: order.id,
        esbOrderId,
        qrData,
        queueNumber: queueNum,
        order,
      });
    }

    // ── sajian_native path ────────────────────────────────────────────────
    // No external POS. Owner sees the order on /admin and manages it from
    // there. `cashier` = customer shows the order number to the cashier;
    // `qris`/`dana`/etc = we create a Xendit payment and hand back the QR
    // or checkout URL, then the Xendit webhook flips payment_status to
    // 'paid' out-of-band.
    const { data: orderNumber } = await supabase.rpc('generate_order_number', {
      p_tenant_id: tenant.id,
      p_branch_code: body.branchCode,
    });

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        tenant_id: tenant.id,
        order_number: orderNumber ?? `N${Date.now().toString().slice(-6)}`,
        customer_id: customer?.id,
        customer_name: body.customerName,
        customer_phone: body.customerPhone,
        items: body.items,
        subtotal,
        total: subtotal,
        order_type: body.orderType,
        table_number: body.tableNumber ?? null,
        delivery_address: body.deliveryAddress ?? null,
        payment_method: body.paymentMethod,
        payment_status: 'pending',
        payment_qr_string: null,
        esb_order_id: null,
        pos_pushed: false,
        status: 'new',
        branch_code: body.branchCode,
        branch_name: branchRow.data?.name ?? body.branchCode,
        customer_notes: body.customerNotes ?? null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[order/submit] native insert failed:', error);
      return NextResponse.json({ error: 'Gagal menyimpan pesanan' }, { status: 500 });
    }

    // Digital payment? Create Xendit payment + patch the order.
    if (isDigital(body.paymentMethod)) {
      try {
        // Build redirect URLs from a trusted source. Host header could be
        // spoofed by an intermediate proxy, so we validate it against the
        // whitelist: *.sajian.app subdomains + localhost for dev. If the
        // incoming Host doesn't match, fall back to the tenant's canonical
        // URL derived from its slug.
        const rawHost = req.headers.get('host') ?? '';
        const trustedHost = isTrustedHost(rawHost)
          ? rawHost
          : `${tenant.slug}.sajian.app`;
        const proto = trustedHost.includes('localhost') ? 'http' : 'https';
        const successUrl = `${proto}://${trustedHost}/track/${order.id}?paid=1`;
        const failureUrl = `${proto}://${trustedHost}/track/${order.id}?paid=0`;

        if (body.paymentMethod === 'qris') {
          const qris = await createQRIS({
            referenceId: order.id,
            amount: subtotal,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          });
          await supabase
            .from('orders')
            .update({
              payment_qr_string: qris.qr_string,
              payment_expires_at: qris.expires_at,
            })
            .eq('id', order.id);
          return NextResponse.json({
            orderId: order.id,
            qrData: qris.qr_string,
            paymentMethod: 'qris',
            expiresAt: qris.expires_at,
          });
        }

        // E-wallet
        const channel = channelFor(body.paymentMethod as 'dana' | 'ovo' | 'shopeepay' | 'gopay');
        const charge = await createEWalletCharge({
          referenceId: order.id,
          amount: subtotal,
          channelCode: channel,
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          successRedirectUrl: successUrl,
          failureRedirectUrl: failureUrl,
        });
        const redirect = checkoutUrl(charge);
        await supabase
          .from('orders')
          .update({ payment_redirect_url: redirect })
          .eq('id', order.id);
        return NextResponse.json({
          orderId: order.id,
          paymentMethod: body.paymentMethod,
          redirectUrl: redirect,
        });
      } catch (payErr) {
        // Xendit failed — mark order and let customer retry via /track.
        await supabase
          .from('orders')
          .update({ payment_status: 'failed' })
          .eq('id', order.id);
        return NextResponse.json(
          { error: (payErr as Error).message, orderId: order.id },
          { status: 502 },
        );
      }
    }

    sendWhatsApp({
      phone: body.customerPhone,
      template: 'order_received',
      data: {
        orderNumber: order.order_number,
        branch: order.branch_name,
        total: subtotal,
      },
    }).catch((err) => console.error('[order/submit] WA notify failed:', err));

    return NextResponse.json({
      orderId: order.id,
      esbOrderId: null,
      qrData: null,
      queueNumber: null,
      order,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// Accepts `slug.sajian.app`, `sajian.app`, and any `localhost[:port]`.
// Anything else is rejected so a spoofed Host header can't route the
// customer through an attacker-controlled checkout redirect.
function isTrustedHost(host: string): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  if (lower === 'sajian.app') return true;
  if (/^[a-z0-9-]+\.sajian\.app$/.test(lower)) return true;
  if (/^(localhost|[a-z0-9-]+\.localhost)(:\d+)?$/.test(lower)) return true;
  return false;
}
