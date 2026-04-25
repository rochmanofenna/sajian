// Seed + reset helpers for integration tests. seedFixtures() is
// idempotent — call it from beforeAll in every test file. The helper
// truncates every tenant-scoped table first, then re-inserts the
// canonical fixture set.
//
// Tenant-scoped tables we truncate (delete-by-tenant_id when CASCADE
// isn't safe; full TRUNCATE for ones that don't fan out): orders,
// menu_items, menu_categories, branches, storefront_sections,
// customer_accounts (test-scope only), customers, tenants.
//
// We do NOT truncate auth.users — instead we upsert the two test
// owners by deterministic UUID. Other auth users on the test branch
// (the supabase admin user, etc.) stay intact.

import { serviceClient } from './clients';
import {
  fixtureTenants,
  fixtureBranches,
  fixtureMenuCategories,
  fixtureMenuItems,
  fixtureSections,
  OWNER_A_ID,
  OWNER_B_ID,
  OWNER_A_EMAIL,
  OWNER_B_EMAIL,
  TENANT_A_ID,
  TENANT_B_ID,
  TENANT_INACTIVE_ID,
} from '../fixtures/tenants';
import { getTestBranch } from './branch';

const FIXTURE_TENANT_IDS = [TENANT_A_ID, TENANT_B_ID, TENANT_INACTIVE_ID];

async function ensureAuthUser(opts: { id: string; email: string; password: string }): Promise<void> {
  // Use the auth admin REST endpoint directly — supabase-js's admin
  // surface requires service-role + cookie management we don't need
  // here. Idempotent by design: 422 (already exists) is a non-error.
  const branch = getTestBranch();
  const url = `${branch.apiUrl}/auth/v1/admin/users`;
  const headers = {
    apikey: branch.serviceRoleKey,
    Authorization: `Bearer ${branch.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
  // First, try to delete any existing user with this id (so password
  // resets cleanly). Ignore 404.
  await fetch(`${url}/${opts.id}`, { method: 'DELETE', headers }).catch(() => undefined);
  // Now create with deterministic id.
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: opts.id,
      email: opts.email,
      password: opts.password,
      email_confirm: true,
      user_metadata: { role: 'owner', test_fixture: true },
    }),
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`auth user create ${opts.email} failed: ${res.status} ${await res.text()}`);
  }
}

export async function seedFixtures(): Promise<void> {
  const sb = await serviceClient();

  // 1. Wipe tenant-scoped data in dependency order.
  await sb.from('orders').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('customers').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('menu_items').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('menu_categories').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('storefront_sections').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('branches').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('feature_flags').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('tenants').delete().in('id', FIXTURE_TENANT_IDS);

  // 2. Re-create auth users + tenants. Owners must exist before
  //    tenants since tenants.owner_user_id has a FK ref.
  await ensureAuthUser({ id: OWNER_A_ID, email: OWNER_A_EMAIL, password: 'test-password-A' });
  await ensureAuthUser({ id: OWNER_B_ID, email: OWNER_B_EMAIL, password: 'test-password-B' });

  await sb.from('tenants').insert(fixtureTenants).throwOnError();
  await sb.from('branches').insert(fixtureBranches).throwOnError();
  await sb.from('menu_categories').insert(fixtureMenuCategories).throwOnError();

  // menu_items needs category_id — re-fetch the inserted categories
  // to map names → ids per tenant.
  const { data: cats } = await sb
    .from('menu_categories')
    .select('id, name, tenant_id')
    .in('tenant_id', FIXTURE_TENANT_IDS);
  const catId = (tenantId: string, name: string) =>
    (cats ?? []).find((c) => c.tenant_id === tenantId && c.name === name)?.id ?? null;

  const itemsWithCat = fixtureMenuItems.map((item) => {
    if (item.tenant_id === TENANT_A_ID) {
      return { ...item, category_id: catId(TENANT_A_ID, item.name === 'Espresso' ? 'Coffee' : 'Pastries') };
    }
    return { ...item, category_id: catId(TENANT_B_ID, 'Sate') };
  });
  await sb.from('menu_items').insert(itemsWithCat).throwOnError();

  await sb.from('storefront_sections').insert(fixtureSections).throwOnError();
}

export async function teardownFixtures(): Promise<void> {
  const sb = await serviceClient();
  await sb.from('orders').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('customers').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('menu_items').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('menu_categories').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('storefront_sections').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('branches').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('feature_flags').delete().in('tenant_id', FIXTURE_TENANT_IDS);
  await sb.from('tenants').delete().in('id', FIXTURE_TENANT_IDS);
}
