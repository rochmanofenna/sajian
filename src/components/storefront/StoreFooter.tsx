// Slim storefront footer. Renders across every tenant page so the owner
// always has a discreet way back into /admin. Deliberately subtle — diners
// don't need to see it, owners know where to look.

import Link from 'next/link';
import type { PublicTenant } from '@/lib/tenant';

export function StoreFooter({ tenant }: { tenant: PublicTenant }) {
  return (
    <footer
      className="mt-auto px-4 py-6 border-t text-xs"
      style={{
        borderColor: `${tenant.colors.primary}12`,
        color: tenant.colors.dark,
      }}
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 opacity-70">
        <span>
          {tenant.name} · <span className="opacity-70">dibuat dengan Sajian</span>
        </span>
        <Link href="/admin" className="hover:underline" style={{ color: tenant.colors.primary }}>
          Kelola toko →
        </Link>
      </div>
    </footer>
  );
}
