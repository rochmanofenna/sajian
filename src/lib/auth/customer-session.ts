// Customer-session helpers. Customer sessions live on the tenant
// subdomain (cookie domain = {slug}.sajian.app) while owner sessions
// live on the app origin — they never mix. Both use Supabase Auth under
// the hood; the split is purely by cookie scope + role metadata.

import { createServiceClient } from '@/lib/supabase/service';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Tenant } from '@/lib/tenant';

export interface CustomerAccount {
  id: string;
  email: string;
  phone: string | null;
  name: string | null;
}

export interface CustomerTenantProfile {
  customer_id: string;
  tenant_id: string;
  saved_addresses: Array<Record<string, unknown>>;
  total_orders: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
}

export interface CustomerSession {
  account: CustomerAccount;
  tenantProfile: CustomerTenantProfile | null;
}

// Server helper used by /akun pages + /api/auth/customer/me. Returns
// null when there's no session OR when the authed user isn't a
// customer (e.g. it's an owner session leaking across — shouldn't
// happen with tenant-scoped cookies but guard anyway).
export async function getCustomerSession(
  tenant: Pick<Tenant, 'id'> | null,
): Promise<CustomerSession | null> {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  // Users carrying a role=owner metadata flag aren't customers. We
  // always stamp role=customer on signups from the customer routes so
  // the absence of that flag is a strong signal this is an owner
  // session that somehow reached a tenant subdomain.
  const role = (user.user_metadata as { role?: string } | null)?.role;
  if (role && role !== 'customer') return null;

  const service = createServiceClient();
  const { data: account } = await service
    .from('customer_accounts')
    .select('id, email, phone, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!account) return null;

  let tenantProfile: CustomerTenantProfile | null = null;
  if (tenant?.id) {
    const { data: row } = await service
      .from('customers')
      .select(
        'id, tenant_id, saved_addresses, total_orders, total_spent, first_order_at, last_order_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('customer_account_id', account.id)
      .maybeSingle();
    if (row) {
      tenantProfile = {
        customer_id: row.id as string,
        tenant_id: row.tenant_id as string,
        saved_addresses: (row.saved_addresses as Array<Record<string, unknown>>) ?? [],
        total_orders: (row.total_orders as number) ?? 0,
        total_spent: (row.total_spent as number) ?? 0,
        first_order_at: (row.first_order_at as string | null) ?? null,
        last_order_at: (row.last_order_at as string | null) ?? null,
      };
    }
  }

  return {
    account: {
      id: account.id as string,
      email: account.email as string,
      phone: (account.phone as string | null) ?? null,
      name: (account.name as string | null) ?? null,
    },
    tenantProfile,
  };
}
