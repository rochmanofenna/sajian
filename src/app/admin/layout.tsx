// Admin dashboard layout. Wraps every owner route in a shell. Auth +
// owner gating happens in the page component because layout rendering
// runs before the page-level redirect chain and we want to share the
// shell with the login screen. Deactivated tenants still render the
// shell — the page shows the owner a reactivate prompt.
//
// Two shell modes:
//   • host tenant exists → tenant-tinted brand strip.
//   • no host tenant (apex /admin or unauthed hit) → neutral Sajian
//     shell so the page has bg + container + height wiring. Without
//     this the body flex layout collapses and the page reads as
//     "CSS didn't load." /admin/codegen paints its own full-page
//     chrome that nests harmlessly inside this outer shell.

import { getPublicTenantAnyStatus } from '@/lib/tenant';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPublicTenantAnyStatus();

  const brandDotColor = tenant ? tenant.colors.primary : '#111827';
  const brandName = tenant?.name ?? 'Sajian';
  const borderColor = tenant ? `${tenant.colors.primary}20` : '#e4e4e7';
  const statusStyle =
    tenant && !tenant.is_active
      ? { background: '#fef2f2', color: '#dc2626' }
      : { background: '#f4f4f5', color: '#52525b' };
  const statusLabel = tenant && !tenant.is_active ? 'Offline' : 'Dashboard';

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 min-h-screen">
      <header className="border-b bg-white" style={{ borderColor }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: brandDotColor }}
            />
            <span className="font-semibold">{brandName}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={statusStyle}>
              {statusLabel}
            </span>
          </div>
          {tenant && (
            <span className="text-xs text-zinc-500 capitalize">
              {tenant.subscription_tier}
            </span>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
