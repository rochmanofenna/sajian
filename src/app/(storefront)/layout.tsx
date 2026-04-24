// Storefront route group layout. Asserts tenant; anything nested here only
// renders on a tenant subdomain. Falls back to a 404-ish page for root domain
// hits (e.g. sajian.app/menu → prompt to visit a tenant subdomain). If the
// tenant exists but is deactivated, shows an offline notice instead.

import Link from 'next/link';
import { getPublicTenantAnyStatus } from '@/lib/tenant';
import { StoreHeader } from '@/components/storefront/StoreHeader';
import { StoreFooter } from '@/components/storefront/StoreFooter';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPublicTenantAnyStatus();

  if (!tenant) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24 bg-white">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold text-zinc-900">Subdomain tenant tidak ditemukan</h1>
          <p className="text-zinc-600">
            Halaman ini hanya tersedia di subdomain tenant, misalnya{' '}
            <span className="font-mono">mindiology.sajian.app</span>.
          </p>
        </div>
      </main>
    );
  }

  if (!tenant.is_active) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24 bg-white">
        <div className="max-w-md text-center space-y-5">
          <div
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em]"
            style={{ color: tenant.colors.primary }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tenant.colors.primary }} />
            {tenant.name}
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">Toko sedang offline</h1>
          <p className="text-zinc-600">
            {tenant.name} sementara tidak menerima pesanan online. Hubungi langsung pemilik toko,
            atau kembali lagi lain waktu.
          </p>
          <Link href="https://sajian.app" className="inline-block text-sm underline text-zinc-500">
            Jelajahi toko lain di Sajian →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <StoreHeader tenant={tenant} />
      <div className="flex-1">{children}</div>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
