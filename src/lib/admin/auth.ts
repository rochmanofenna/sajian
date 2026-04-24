// Server-side helpers for the admin dashboard. Gates every admin route +
// API on a valid Supabase session AND ownership of the current tenant.
//
// Host resolution is dual-mode:
//   1. Host has a tenant slug (e.g. mindiology.sajian.app/admin) → use that
//      tenant, check the user owns it.
//   2. Host is the app apex (sajian.app/admin) → resolve the tenant by
//      looking up which tenant the authed user owns. This is what makes
//      sajian.app/admin work after the proxy redirects owner paths off
//      tenant subdomains onto the app origin.
//
// Two flavors:
//   • requireOwnerOrThrow — for API handlers. Throws a typed error that
//     errorResponse maps to 401/403.
//   • getOwnerOrNull — for the admin layout. Returns null when unauthed so
//     the layout can render the inline login instead of redirecting.

import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getTenantAnyStatus, type Tenant } from '@/lib/tenant';

export interface AdminSession {
  userId: string;
  email: string | null;
  tenant: Tenant;
}

async function tenantOwnedBy(userId: string): Promise<Tenant | null> {
  const service = createServiceClient();
  // Pick the oldest-owned tenant so re-logging-in lands the owner on the
  // same store each time. If an owner eventually has multiple tenants
  // we'll grow a chooser; today nobody does, so this stays simple.
  const { data } = await service
    .from('tenants')
    .select('*')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Tenant | null) ?? null;
}

// Resolve the tenant regardless of is_active so the owner of a deactivated
// store can still log in and reactivate it. The admin page surfaces the
// inactive state visibly; other admin APIs should block writes when inactive
// by checking `session.tenant.is_active` themselves.
export async function getOwnerOrNull(): Promise<AdminSession | null> {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const hostTenant = await getTenantAnyStatus();

  if (hostTenant) {
    // Host supplied a tenant — enforce ownership against that specific
    // tenant. Prevents a logged-in owner of one tenant from reaching
    // /admin on someone else's subdomain.
    const service = createServiceClient();
    const { data: ownerRow } = await service
      .from('tenants')
      .select('owner_user_id')
      .eq('id', hostTenant.id)
      .maybeSingle();
    if (!ownerRow || ownerRow.owner_user_id !== user.id) return null;
    return {
      userId: user.id,
      email: user.email ?? null,
      tenant: hostTenant,
    };
  }

  // No host tenant (app apex). Fall back to the tenant this user owns.
  const owned = await tenantOwnedBy(user.id);
  if (!owned) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    tenant: owned,
  };
}

export async function requireOwnerOrThrow(): Promise<AdminSession> {
  const session = await getOwnerOrNull();
  if (!session) {
    const err = new Error('NOT_OWNER');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return session;
}
