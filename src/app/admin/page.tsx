// /admin — unified owner dashboard. Gates on a Supabase session AND
// ownership match; renders the inline OTP login otherwise. When authed,
// dispatches to one of four panels via ?tab=.

import { createClient as createServerClient } from '@/lib/supabase/server';
import { requirePublicTenant } from '@/lib/tenant';
import { getOwnerOrNull } from '@/lib/admin/auth';
import { OwnerLogin } from '@/components/admin/OwnerLogin';
import { AdminTabs, type AdminTab } from '@/components/admin/AdminTabs';
import { OrderFeed } from '@/components/admin/OrderFeed';
import { MenuEditor } from '@/components/admin/MenuEditor';
import { TokoSettings } from '@/components/admin/TokoSettings';
import { AdminAIWorkspace } from '@/components/admin/AdminAIWorkspace';

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
  const tenant = await requirePublicTenant();
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
