// POST /api/webhooks/xendit — Xendit payment callbacks.
//
// Xendit fires this endpoint for both QRIS and e-wallet charge events. We
// verify the `x-callback-token` header against XENDIT_CALLBACK_TOKEN, then
// flip the matching order's payment_status based on the Xendit status.
//
// Payload shapes vary by product. We key off `event`/`data`/`reference_id`
// fields and handle the common statuses: SUCCEEDED / PAID / COMPLETED flip
// to 'paid'; FAILED / EXPIRED / VOIDED flip to the matching status; others
// are ignored (logged for diagnostics).
//
// After marking 'paid', we send the customer the WhatsApp order-received
// template so the UX parity with cashier flow holds.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCallbackToken } from '@/lib/payments/xendit';
import { sendWhatsApp } from '@/lib/notify/whatsapp';

interface XenditCallback {
  event?: string;
  data?: {
    reference_id?: string;
    status?: string;
    amount?: number;
    id?: string;
  };
  // Legacy flat shapes (older Xendit products):
  reference_id?: string;
  status?: string;
  external_id?: string;
  id?: string;
  event_type?: string;
}

function pickRef(payload: XenditCallback): string | null {
  return (
    payload.data?.reference_id ??
    payload.reference_id ??
    payload.external_id ??
    null
  );
}

function pickStatus(payload: XenditCallback): string | null {
  return payload.data?.status ?? payload.status ?? null;
}

function mapStatus(xenditStatus: string | null): 'paid' | 'failed' | 'expired' | null {
  if (!xenditStatus) return null;
  const s = xenditStatus.toUpperCase();
  if (s === 'SUCCEEDED' || s === 'PAID' || s === 'COMPLETED') return 'paid';
  if (s === 'FAILED' || s === 'VOIDED') return 'failed';
  if (s === 'EXPIRED' || s === 'INACTIVE') return 'expired';
  return null;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-callback-token');
  if (!verifyCallbackToken(token)) {
    return NextResponse.json({ error: 'invalid callback token' }, { status: 401 });
  }

  let payload: XenditCallback;
  try {
    payload = (await req.json()) as XenditCallback;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const referenceId = pickRef(payload);
  if (!referenceId) {
    console.warn('[xendit-webhook] no reference_id in payload', payload);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Xendit's dashboard "Test URL" sends reference_ids like "test-payload" that
  // aren't UUIDs. Accept gracefully instead of letting Postgres 500 on cast.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(referenceId)) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'non-uuid reference_id' });
  }

  const status = mapStatus(pickStatus(payload));
  if (!status) {
    console.info('[xendit-webhook] status not mapped, ignoring', {
      referenceId,
      status: pickStatus(payload),
      event: payload.event ?? payload.event_type,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = createServiceClient();

  // Reference ID is the order.id (UUID) we passed when creating the payment.
  const { data: order, error: readErr } = await supabase
    .from('orders')
    .select('id, tenant_id, order_number, customer_phone, branch_name, total, payment_status')
    .eq('id', referenceId)
    .maybeSingle();

  if (readErr) {
    console.error('[xendit-webhook] order lookup failed', readErr);
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!order) {
    console.warn('[xendit-webhook] no order for reference_id', referenceId);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Idempotency — don't re-flip if already terminal.
  if (order.payment_status === 'paid' && status === 'paid') {
    return NextResponse.json({ ok: true, already: 'paid' });
  }

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ payment_status: status })
    .eq('id', order.id);

  if (updateErr) {
    console.error('[xendit-webhook] order update failed', updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (status === 'paid' && order.customer_phone) {
    sendWhatsApp({
      phone: order.customer_phone,
      template: 'order_received',
      data: {
        orderNumber: order.order_number,
        branch: order.branch_name ?? '',
        total: order.total,
      },
    }).catch((err) => console.error('[xendit-webhook] WA notify failed:', err));
  }

  return NextResponse.json({ ok: true, status });
}

// Xendit does a GET health check on some products during webhook setup.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'xendit-webhook' });
}
