// Server-side helpers for the admin dashboard. Gates every admin route +
// API on a valid Supabase session AND ownership of the current tenant.
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

// Resolve the tenant regardless of is_active so the owner of a deactivated
// store can still log in and reactivate it. The admin page surfaces the
// inactive state visibly; other admin APIs should block writes when inactive
// by checking `session.tenant.is_active` themselves.
export async function getOwnerOrNull(): Promise<AdminSession | null> {
  const tenant = await getTenantAnyStatus();
  if (!tenant) return null;

  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  // Owner check uses the service client so RLS can't accidentally reject
  // the read and confuse the gate.
  const service = createServiceClient();
  const { data: ownerRow } = await service
    .from('tenants')
    .select('owner_user_id')
    .eq('id', tenant.id)
    .maybeSingle();

  if (!ownerRow || ownerRow.owner_user_id !== user.id) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    tenant,
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
