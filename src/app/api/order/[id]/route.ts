// GET /api/order/[id] — order detail + synced payment/order status.
//
// [id] is our Supabase orders.id (uuid). We look up the row, then — for ESB
// tenants — poll /qsv1/payment/validate to refresh payment_status and status.
// The storefront's /track page polls this every 3-4s.

import { NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/api/tenant-api';
import { errorResponse } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { ESBClient } from '@/lib/esb/client';
import { mapPaymentStatus, mapOrderStatus } from '@/lib/esb/status-map';
import type { ESBValidatePaymentResponse } from '@/lib/esb/types';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await resolveTenant();
    const supabase = createServiceClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // For cashier orders there's no payment-validate loop — status transitions
    // are manual (cashier marks paid via POS). Short-circuit here.
    if (order.payment_method === 'cashier' || tenant.pos_provider !== 'esb' || !order.esb_order_id) {
      return NextResponse.json({ order });
    }

    // ESB online payment: refresh status.
    try {
      const esb = new ESBClient(tenant);
      const resp = await esb.validatePayment(order.branch_code, order.esb_order_id);
      const envelope = resp as { data?: ESBValidatePaymentResponse };
      const v: ESBValidatePaymentResponse = envelope.data ?? (resp as ESBValidatePaymentResponse);

      const secondsSince = order.confirmed_at
        ? Math.floor((Date.now() - new Date(order.confirmed_at).getTime()) / 1000)
        : 0;

      const newPaymentStatus = mapPaymentStatus(v.status, v.flagPushToPOS);
      const newOrderStatus = mapOrderStatus(v.status, v.flagPushToPOS, secondsSince);

      if (newPaymentStatus !== order.payment_status || newOrderStatus !== order.status) {
        const patch: Record<string, unknown> = {
          payment_status: newPaymentStatus,
          status: newOrderStatus,
        };
        if (newPaymentStatus === 'paid' && !order.confirmed_at) {
          patch.confirmed_at = new Date().toISOString();
          patch.pos_pushed = v.flagPushToPOS === true;
        }
        const { data: updated } = await supabase
          .from('orders')
          .update(patch)
          .eq('id', order.id)
          .select('*')
          .single();
        return NextResponse.json({ order: updated ?? { ...order, ...patch } });
      }
    } catch (err) {
      console.warn('[order/:id] ESB validatePayment failed, returning cached order:', err);
    }

    return NextResponse.json({ order });
  } catch (err) {
    return errorResponse(err);
  }
}
