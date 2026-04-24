// /admin — unified owner dashboard. Gates on a Supabase session AND
// ownership match; renders the inline OTP login otherwise. When authed,
// dispatches to one of four panels via ?tab=. If the tenant is deactivated,
// the verified owner lands on a reactivate pane instead of the tabs so they
// can bring the store back online.

import { createClient as createServerClient } from '@/lib/supabase/server';
import { getPublicTenantAnyStatus, toPublicTenant } from '@/lib/tenant';
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
  // Dual-mode host resolution. On a tenant subdomain the public tenant
  // comes from the host. On the app apex (sajian.app/admin) there's no
  // host tenant — getOwnerOrNull() falls back to the tenant owned by
  // the authed user, which is how `sajian.app/admin` becomes a working
  // dashboard without needing to send the owner to a subdomain.
  const hostTenant = await getPublicTenantAnyStatus();
  const owner = await getOwnerOrNull();

  // Unauthed anywhere → show the inline login. For host-tenant mode the
  // login ties to that tenant's branding; on the apex we render a
  // generic neutral login since we haven't figured out which store yet.
  if (!owner) {
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (hostTenant) {
      return <OwnerLogin tenant={hostTenant} reason={user ? 'not_owner' : 'unauth'} />;
    }
    return <OwnerLogin reason={user ? 'not_owner' : 'unauth'} />;
  }

  // Owner is authed — derive the public tenant from their owned row so
  // every downstream component has the exact same object shape whether
  // we entered via subdomain or apex.
  const tenant = hostTenant ?? toPublicTenant(owner.tenant);

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
