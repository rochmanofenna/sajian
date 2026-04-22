// Thin wrapper around getTenant() for API routes. Returns { tenant, esb } or
// throws a NO_TENANT error (caught by errorResponse). For ESB-backed tenants,
// pre-builds the ESB client so route handlers stay flat.

import { getTenant, type Tenant } from '@/lib/tenant';
import { ESBClient } from '@/lib/esb/client';

export async function resolveTenant(): Promise<Tenant> {
  const tenant = await getTenant();
  if (!tenant) {
    throw new Error('NO_TENANT');
  }
  return tenant;
}

export async function resolveESBTenant(): Promise<{ tenant: Tenant; esb: ESBClient }> {
  const tenant = await resolveTenant();
  if (tenant.pos_provider !== 'esb') {
    throw new Error(`Tenant ${tenant.slug} is not ESB-backed`);
  }
  return { tenant, esb: new ESBClient(tenant) };
}
