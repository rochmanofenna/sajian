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
import { submitOrderSchema } from '@/lib/order/schema';
import { toESBCashierPayload } from '@/lib/order/esb-mapper';
import { ESBClient, visitPurposeFor } from '@/lib/esb/client';
import type { ESBBranchSettings } from '@/lib/esb/types';
import { sendWhatsApp } from '@/lib/notify/whatsapp';

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

    if (body.paymentMethod !== 'cashier') {
      return badRequest('Only cashier payment is supported in Phase 1');
    }

    const tenant = await resolveTenant();
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

      const lat = settings.latitude ?? -6.287;
      const lng = settings.longitude ?? 106.716;

      const esbPayload = toESBCashierPayload(body, visitPurposeID, lat, lng);
      const esbResponse = (await esb.submitCashierOrder(body.branchCode, esbPayload)) as ESBCashierEnvelope;
      const esbOrderId = esbResponse.orderID ?? esbResponse.data?.orderID;
      const qrData = esbResponse.qrData ?? esbResponse.data?.qrData;
      const queueNum = esbResponse.queueNum ?? esbResponse.data?.queueNum ?? null;

      if (!esbOrderId || !qrData) {
        return NextResponse.json(
          { error: 'ESB did not return qrData or orderID', raw: esbResponse },
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
    // there. No QR — customer shows the order number to the cashier.
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
        payment_method: 'cashier',
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
