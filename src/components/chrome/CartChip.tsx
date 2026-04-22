'use client';

// Trailing cart pill for PageNav. Shows item count + subtotal when cart is
// non-empty, otherwise just a thin "Keranjang" link so the entry point is
// always available.

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';

export function CartChip({ tenant }: { tenant: PublicTenant }) {
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getSubtotal());
  const count = items.reduce((n, i) => n + i.quantity, 0);

  if (count === 0) {
    return (
      <Link href="/cart" className="pn-chip" style={{ background: 'transparent', color: 'var(--color-dark, #0A0B0A)', border: '1px dotted color-mix(in oklab, var(--color-dark, #0A0B0A) 28%, transparent)', boxShadow: 'none' }}>
        <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Keranjang</span>
      </Link>
    );
  }

  return (
    <Link href="/cart" className="pn-chip" style={{ background: tenant.colors.primary }}>
      <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="pn-chip__count">{count}</span>
      <span>{formatCurrency(subtotal, tenant.currency_symbol, tenant.locale)}</span>
    </Link>
  );
}
