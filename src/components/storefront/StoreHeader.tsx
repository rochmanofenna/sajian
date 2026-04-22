// Sticky top nav for tenant storefront. Tenant name + cart button.

import Link from 'next/link';
import type { Tenant } from '@/lib/tenant';
import { CartButton } from './CartButton';

export function StoreHeader({ tenant }: { tenant: Tenant }) {
  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur bg-white/80"
      style={{ borderColor: `${tenant.colors.primary}20` }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="h-7" />
          ) : (
            <span className="font-semibold tracking-tight" style={{ color: tenant.colors.primary }}>
              {tenant.name}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/menu" className="text-sm text-zinc-700 hover:text-zinc-900">
            Menu
          </Link>
          <CartButton tenant={tenant} />
        </div>
      </div>
    </header>
  );
}
