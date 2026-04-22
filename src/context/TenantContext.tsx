// Client-side tenant context. Server components hydrate this so client
// components (cart button, menu filters) don't have to refetch the tenant.

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PublicTenant } from '@/lib/tenant';

const TenantContext = createContext<PublicTenant | null>(null);

export function TenantProvider({ tenant, children }: { tenant: PublicTenant; children: ReactNode }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

export function useTenant(): PublicTenant {
  const t = useContext(TenantContext);
  if (!t) throw new Error('useTenant() called outside <TenantProvider>');
  return t;
}

// Safe variant — returns null on the root domain instead of throwing.
export function useTenantOptional(): PublicTenant | null {
  return useContext(TenantContext);
}
