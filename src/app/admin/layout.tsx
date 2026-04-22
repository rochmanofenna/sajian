// Admin (merchant) dashboard layout. Requires a tenant — same subdomain scope
// as the storefront. Phase 1 has no auth wall; anyone on
// mindiology.sajian.app/admin can see Mindiology's orders. Phase 2 adds
// Supabase Auth with owner_phone gating.

import { getPublicTenant } from '@/lib/tenant';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPublicTenant();

  if (!tenant) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24 bg-zinc-50">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Dashboard tenant tidak ditemukan</h1>
          <p className="text-zinc-600">
            Dashboard hanya tersedia di subdomain tenant, misalnya{' '}
            <span className="font-mono">mindiology.sajian.app/admin</span>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-50">
      <header
        className="border-b bg-white"
        style={{ borderColor: `${tenant.colors.primary}20` }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: tenant.colors.primary }}
            />
            <span className="font-semibold">{tenant.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
              Admin
            </span>
          </div>
          <span className="text-xs text-zinc-500">{tenant.subscription_tier}</span>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
