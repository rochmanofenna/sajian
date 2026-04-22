'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/cart/store';
import type { Tenant } from '@/lib/tenant';

export function CartButton({ tenant }: { tenant: Tenant }) {
  // Zustand's persist middleware hydrates from localStorage on the client only,
  // so the server always renders count=0. Gate the badge behind a mount flag to
  // avoid the SSR/CSR mismatch.
  const count = useCart((s) => s.getItemCount());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-white text-sm font-medium"
      style={{ background: tenant.colors.primary }}
    >
      <ShoppingBag className="h-4 w-4" />
      <span>Cart</span>
      {mounted && count > 0 && (
        <span
          className="inline-flex items-center justify-center text-xs font-semibold rounded-full min-w-5 h-5 px-1.5"
          style={{ background: tenant.colors.accent, color: tenant.colors.dark }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
