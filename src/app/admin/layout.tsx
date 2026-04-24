// Admin dashboard layout. Wraps every owner route in a shell with the
// tenant's brand strip. Auth + owner gating happens in the page component
// because layout rendering runs before the page-level redirect chain and
// we want to share the shell with the login screen. Deactivated tenants
// still render the shell — the page shows the owner a reactivate prompt.

import { getPublicTenantAnyStatus } from '@/lib/tenant';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPublicTenantAnyStatus();

  // When there's no tenant context (e.g. /admin/codegen on the app
  // origin, or /admin hit directly on sajian.app) pass through — the
  // page or nested layout is responsible for its own chrome + gate.
  if (!tenant) {
    return <>{children}</>;
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
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={
                tenant.is_active
                  ? { background: '#f4f4f5', color: '#52525b' }
                  : { background: '#fef2f2', color: '#dc2626' }
              }
            >
              {tenant.is_active ? 'Dashboard' : 'Offline'}
            </span>
          </div>
          <span className="text-xs text-zinc-500 capitalize">{tenant.subscription_tier}</span>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
