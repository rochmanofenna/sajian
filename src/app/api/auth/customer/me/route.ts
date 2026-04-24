// GET /api/auth/customer/me — current customer session shape + per-
// tenant profile. Used by the AccountMenu and the /akun pages.

import { NextResponse } from 'next/server';
import { getTenant } from '@/lib/tenant';
import { getCustomerSession } from '@/lib/auth/customer-session';
import { errorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tenant = await getTenant();
    const session = await getCustomerSession(tenant);
    if (!session) {
      return NextResponse.json({ session: null });
    }
    return NextResponse.json({ session });
  } catch (err) {
    return errorResponse(err);
  }
}
