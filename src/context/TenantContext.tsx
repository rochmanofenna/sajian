// Client-side tenant context. Server components hydrate this so client
// components (cart button, menu filters) don't have to refetch the tenant.
//
// On mount we also scrub the persisted cart if it belongs to a different
// tenant — prevents tenant A's items from leaking into tenant B's checkout
// when a customer navigates directly across subdomains.

'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { PublicTenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';

const TenantContext = createContext<PublicTenant | null>(null);

export function TenantProvider({ tenant, children }: { tenant: PublicTenant; children: ReactNode }) {
  const ensureTenantScope = useCart((s) => s.ensureTenantScope);
  useEffect(() => {
    ensureTenantScope(tenant.slug);
  }, [tenant.slug, ensureTenantScope]);
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
