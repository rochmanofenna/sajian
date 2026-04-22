// Tenant storefront home. Branch picker → Menu CTA.
// Real branch list is loaded client-side after geolocation; this component
// renders the hero + fetch trigger only. Actual branch picker lives in
// BranchPicker (client).

import Link from 'next/link';
import type { PublicTenant } from '@/lib/tenant';
import { BranchPicker } from './BranchPicker';

export function StorefrontHome({ tenant }: { tenant: PublicTenant }) {
  return (
    <main className="flex-1 flex flex-col">
      <section
        className="px-6 py-20 text-center"
        style={{ background: `linear-gradient(180deg, ${tenant.colors.background} 0%, ${tenant.colors.primary}15 100%)` }}
      >
        <div className="max-w-2xl mx-auto space-y-4">
          {tenant.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="h-16 mx-auto mb-2" />
          )}
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight" style={{ color: tenant.colors.primary }}>
            {tenant.name}
          </h1>
          {tenant.tagline && <p className="text-lg text-zinc-700">{tenant.tagline}</p>}

          <div className="pt-8">
            <BranchPicker tenant={tenant} />
          </div>

          <div className="pt-4">
            <Link
              href="/menu"
              className="inline-flex h-12 items-center px-8 rounded-full text-white font-medium"
              style={{ background: tenant.colors.primary }}
            >
              Lihat Menu
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
