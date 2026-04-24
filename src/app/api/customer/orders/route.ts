// GET /api/customer/orders — order history for the signed-in customer
// scoped to the current tenant. Paginated, newest-first. Rendered by
// /akun/pesanan.

import { NextResponse } from 'next/server';
import { getTenant } from '@/lib/tenant';
import { getCustomerSession } from '@/lib/auth/customer-session';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const tenant = await getTenant();
    const session = await getCustomerSession(tenant);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!tenant) return NextResponse.json({ error: 'tenant required' }, { status: 400 });
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);
    const service = createServiceClient();
    if (!session.tenantProfile) {
      return NextResponse.json({ orders: [] });
    }
    const { data, error } = await service
      .from('orders')
      .select(
        'id, order_number, status, payment_status, payment_method, total, branch_name, order_type, items, created_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('customer_id', session.tenantProfile.customer_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ orders: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
