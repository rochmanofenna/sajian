// /admin — unified owner dashboard. Gates on a Supabase session AND
// ownership match; renders the inline OTP login otherwise. When authed,
// dispatches to one of four panels via ?tab=. If the tenant is deactivated,
// the verified owner lands on a reactivate pane instead of the tabs so they
// can bring the store back online.

import { createClient as createServerClient } from '@/lib/supabase/server';
import { getPublicTenantAnyStatus } from '@/lib/tenant';
import { getOwnerOrNull } from '@/lib/admin/auth';
import { OwnerLogin } from '@/components/admin/OwnerLogin';
import { AdminTabs, type AdminTab } from '@/components/admin/AdminTabs';
import { OrderFeed } from '@/components/admin/OrderFeed';
import { MenuEditor } from '@/components/admin/MenuEditor';
import { TokoSettings } from '@/components/admin/TokoSettings';
import { AdminAIWorkspace } from '@/components/admin/AdminAIWorkspace';
import { InactiveTenantPanel } from '@/components/admin/InactiveTenantPanel';

function resolveTab(raw: string | string[] | undefined): AdminTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'menu' || v === 'store' || v === 'ai' || v === 'orders') return v;
  return 'orders';
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const tenant = await getPublicTenantAnyStatus();
  // The layout already handles the "no tenant at all" case. If we got here
  // without a tenant, it's either a race or misconfig — fall back gracefully.
  if (!tenant) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-zinc-600">
        Dashboard tidak tersedia untuk subdomain ini.
      </div>
    );
  }

  const owner = await getOwnerOrNull();

  if (!owner) {
    // Differentiate "not logged in" vs "logged in but not owner" so the
    // copy is honest about what went wrong.
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    return <OwnerLogin tenant={tenant} reason={user ? 'not_owner' : 'unauth'} />;
  }

  if (!tenant.is_active) {
    return <InactiveTenantPanel tenant={tenant} />;
  }

  const params = await searchParams;
  const tab = resolveTab(params.tab);

  return (
    <>
      <AdminTabs tenant={tenant} active={tab} />
      {tab === 'orders' && <OrderFeed tenant={tenant} />}
      {tab === 'menu' && <MenuEditor tenant={tenant} />}
      {tab === 'store' && <TokoSettings tenant={tenant} />}
      {tab === 'ai' && <AdminAIWorkspace tenant={tenant} />}
    </>
  );
}

export const dynamic = 'force-dynamic';
