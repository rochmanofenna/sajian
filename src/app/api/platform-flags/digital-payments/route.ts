// GET /api/platform-flags/digital-payments — public read of the
// digital_payments_enabled gate. Only returns the boolean; never
// leaks any other flag. Used by CheckoutView to filter the payment
// option list. The /api/order/submit route enforces the gate
// independently for defense-in-depth.

import { NextResponse } from 'next/server';
import { isDigitalPaymentsEnabled } from '@/lib/platform-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const enabled = await isDigitalPaymentsEnabled();
  return NextResponse.json({ enabled });
}
