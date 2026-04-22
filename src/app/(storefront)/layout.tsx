// Storefront route group layout. Asserts tenant; anything nested here only
// renders on a tenant subdomain. Falls back to a 404-ish page for root domain
// hits (e.g. sajian.app/menu → prompt to visit a tenant subdomain).

import { getPublicTenant } from '@/lib/tenant';
import { StoreHeader } from '@/components/storefront/StoreHeader';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPublicTenant();

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

  return (
    <div className="flex flex-col flex-1">
      <StoreHeader tenant={tenant} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
