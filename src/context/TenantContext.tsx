// Client-side tenant context. Server components hydrate this so client
// components (cart button, menu filters) don't have to refetch the tenant.

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Tenant } from '@/lib/tenant';

const TenantContext = createContext<Tenant | null>(null);

export function TenantProvider({ tenant, children }: { tenant: Tenant; children: ReactNode }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

export function useTenant(): Tenant {
  const t = useContext(TenantContext);
  if (!t) throw new Error('useTenant() called outside <TenantProvider>');
  return t;
}

// Safe variant — returns null on the root domain instead of throwing.
export function useTenantOptional(): Tenant | null {
  return useContext(TenantContext);
}
