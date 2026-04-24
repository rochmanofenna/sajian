// POST /api/customer/link-guest-orders
//
// Invoked by the confirmation page after a guest order → "yes, sign me
// up" flow completes verification. Migrates any orders with
// guest_contact.email = session.email on the current tenant into the
// new customer_accounts linkage.

import { NextResponse } from 'next/server';
import { getTenant } from '@/lib/tenant';
import { getCustomerSession } from '@/lib/auth/customer-session';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json({ error: 'tenant required' }, { status: 400 });
    }
    const session = await getCustomerSession(tenant);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const service = createServiceClient();
    const { data, error } = await service.rpc('link_guest_orders_to_account', {
      p_account_id: session.account.id,
      p_tenant_id: tenant.id,
      p_email: session.account.email,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, linked: Number(data ?? 0) });
  } catch (err) {
    return errorResponse(err);
  }
}
