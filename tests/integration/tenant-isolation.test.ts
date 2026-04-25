// Tenant-isolation integration tests — the Xendit-class prevention.
//
// What we're proving: a tenant's customer-paid money cannot land in
// another tenant's account, because at the DB layer one tenant's
// authed user CANNOT read or write another tenant's rows. We verify
// the invariant on every tenant-scoped table.
//
// We use three Supabase clients in different combos:
//   • serviceClient — bypasses RLS. Sanity-check the seed worked.
//   • authedClient(ownerA) — authed as Mindiology's owner. Reads
//     Sate Taichan Uda's rows MUST come back empty.
//   • authedClient(ownerB) — same, mirrored.
//   • anonClient — what storefront customers use. Reads only public
//     rows of the resolved tenant; cannot escalate.

import { describe, it, expect, beforeAll } from 'vitest';
import { serviceClient, authedClient, anonClient } from './helpers/clients';
import { signInAs } from './helpers/auth';
import { seedFixtures } from './helpers/seed';
import {
  TENANT_A_ID,
  TENANT_B_ID,
  OWNER_A_EMAIL,
  OWNER_B_EMAIL,
} from './fixtures/tenants';

describe('tenant isolation', () => {
  let ownerAToken: string;
  let ownerBToken: string;

  beforeAll(async () => {
    await seedFixtures();
    const a = await signInAs(OWNER_A_EMAIL, 'test-password-A');
    const b = await signInAs(OWNER_B_EMAIL, 'test-password-B');
    ownerAToken = a.accessToken;
    ownerBToken = b.accessToken;
  });

  describe('seed sanity (service-role bypass works)', () => {
    it('all three tenants exist', async () => {
      const sb = await serviceClient();
      const { data } = await sb
        .from('tenants')
        .select('id, slug')
        .in('id', [TENANT_A_ID, TENANT_B_ID]);
      expect(data).toHaveLength(2);
    });
  });

  describe('orders — owner A cannot see tenant B orders', () => {
    beforeAll(async () => {
      const sb = await serviceClient();
      await sb.from('orders').insert([
        {
          tenant_id: TENANT_A_ID,
          order_number: 'A-001',
          customer_name: 'cust-a',
          customer_phone: '081234',
          items: [],
          subtotal: 25000,
          total: 25000,
          order_type: 'takeaway',
          payment_method: 'cashier',
          payment_status: 'pending',
          status: 'new',
          branch_code: 'mindiology-main',
          branch_name: 'Mindiology Main (test)',
        },
        {
          tenant_id: TENANT_B_ID,
          order_number: 'B-001',
          customer_name: 'cust-b',
          customer_phone: '081567',
          items: [],
          subtotal: 30000,
          total: 30000,
          order_type: 'takeaway',
          payment_method: 'cashier',
          payment_status: 'pending',
          status: 'new',
          branch_code: 'sate-main',
          branch_name: 'Sate Main (test)',
        },
      ]).throwOnError();
    });

    it('service role sees both', async () => {
      const sb = await serviceClient();
      const { data } = await sb
        .from('orders')
        .select('order_number, tenant_id')
        .in('tenant_id', [TENANT_A_ID, TENANT_B_ID]);
      expect(data?.length).toBeGreaterThanOrEqual(2);
    });

    it('owner A authed client sees ONLY tenant A orders', async () => {
      const sb = await authedClient(ownerAToken);
      const { data, error } = await sb
        .from('orders')
        .select('order_number, tenant_id');
      expect(error).toBeNull();
      // Either every row is tenant A, or RLS filters everything out
      // (also acceptable — the storefront reads orders via service
      // client). The Xendit-class assertion is: we must NEVER see
      // tenant B rows here.
      const sawB = (data ?? []).some((r) => r.tenant_id === TENANT_B_ID);
      expect(sawB).toBe(false);
    });

    it('owner B authed client sees ONLY tenant B orders', async () => {
      const sb = await authedClient(ownerBToken);
      const { data } = await sb
        .from('orders')
        .select('order_number, tenant_id');
      const sawA = (data ?? []).some((r) => r.tenant_id === TENANT_A_ID);
      expect(sawA).toBe(false);
    });
  });

  describe('storefront_sections — public-by-design for active+visible only', () => {
    // storefront_sections RLS allows anon reads of any visible
    // section from any active tenant — that's the storefront render
    // path. Sections ARE public content. The real invariant we
    // test: anon must NOT see hidden sections + sections of
    // inactive tenants.

    it('anon can read tenant A visible sections (storefront render works)', async () => {
      const sb = await anonClient();
      const { data } = await sb
        .from('storefront_sections')
        .select('id, tenant_id, is_visible')
        .eq('tenant_id', TENANT_A_ID);
      expect((data ?? []).length).toBeGreaterThan(0);
      expect((data ?? []).every((r) => r.is_visible !== false)).toBe(true);
    });

    it('anon cannot see hidden sections', async () => {
      const sb = await serviceClient();
      const { data: sections } = await sb
        .from('storefront_sections')
        .select('id')
        .eq('tenant_id', TENANT_A_ID)
        .limit(1);
      const targetId = sections?.[0]?.id;
      if (!targetId) throw new Error('seed missing tenant A section');
      await sb
        .from('storefront_sections')
        .update({ is_visible: false })
        .eq('id', targetId)
        .throwOnError();

      const sbAnon = await anonClient();
      const { data: anonRead } = await sbAnon
        .from('storefront_sections')
        .select('id')
        .eq('id', targetId);
      expect(anonRead ?? []).toHaveLength(0);

      await sb
        .from('storefront_sections')
        .update({ is_visible: true })
        .eq('id', targetId);
    });

    it('anon cannot see sections of inactive tenants', async () => {
      const sb = await serviceClient();
      const { data: inserted } = await sb
        .from('storefront_sections')
        .insert({
          tenant_id: '33333333-3333-4333-8333-333333333333',
          type: 'hero',
          variant: 'fullscreen',
          sort_order: 1,
          is_visible: true,
          props: {},
        })
        .select('id')
        .single();
      const insertedId = inserted?.id;

      const sbAnon = await anonClient();
      const { data: anonRead } = await sbAnon
        .from('storefront_sections')
        .select('id')
        .eq('id', insertedId);
      expect(anonRead ?? []).toHaveLength(0);

      if (insertedId) await sb.from('storefront_sections').delete().eq('id', insertedId);
    });
  });

  describe('menu_items — service-role-scoped writes do not leak', () => {
    it('owner A authed cannot insert into tenant B', async () => {
      const sb = await authedClient(ownerAToken);
      const { error } = await sb.from('menu_items').insert({
        tenant_id: TENANT_B_ID,
        name: 'Sneaky Item',
        price: 99000,
        is_available: true,
      });
      // Either RLS rejects (preferred) or the row is silently
      // dropped — both protect the invariant. A successful insert
      // would be the bug.
      if (!error) {
        const sbService = await serviceClient();
        const { data: leaked } = await sbService
          .from('menu_items')
          .select('id')
          .eq('tenant_id', TENANT_B_ID)
          .eq('name', 'Sneaky Item');
        expect(leaked ?? []).toHaveLength(0);
      } else {
        expect(error.code).toBeDefined();
      }
    });
  });

  describe('feature_flags — owner A cannot read/write tenant B flag', () => {
    beforeAll(async () => {
      const sb = await serviceClient();
      await sb
        .from('feature_flags')
        .upsert([
          { tenant_id: TENANT_A_ID, codegen_enabled: true, codegen_enabled_by: 'test' },
          { tenant_id: TENANT_B_ID, codegen_enabled: false, codegen_enabled_by: 'test' },
        ], { onConflict: 'tenant_id' });
    });

    it('owner A authed cannot see tenant B flag row', async () => {
      const sb = await authedClient(ownerAToken);
      const { data } = await sb
        .from('feature_flags')
        .select('tenant_id, codegen_enabled')
        .eq('tenant_id', TENANT_B_ID);
      expect(data ?? []).toHaveLength(0);
    });

    it('owner A authed cannot flip tenant B flag', async () => {
      const sb = await authedClient(ownerAToken);
      const { data } = await sb
        .from('feature_flags')
        .update({ codegen_enabled: true })
        .eq('tenant_id', TENANT_B_ID)
        .select('codegen_enabled');
      expect(data ?? []).toHaveLength(0);
      // Verify via service client that tenant B's flag is unchanged.
      const sbService = await serviceClient();
      const { data: actual } = await sbService
        .from('feature_flags')
        .select('codegen_enabled')
        .eq('tenant_id', TENANT_B_ID)
        .single();
      expect(actual?.codegen_enabled).toBe(false);
    });
  });
});
