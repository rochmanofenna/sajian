// POST /api/onboarding/launch
//
// Reads the authenticated user's draft from onboarding_drafts, then calls
// the atomic onboarding_launch() RPC which creates the tenant + categories
// + items + default branch in one transaction. Returns the new slug.

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { generateSlug, isValidSlug } from '@/lib/onboarding/slug';
import type { TenantDraft, StorefrontSection } from '@/lib/onboarding/types';
import { isKnownSection } from '@/lib/storefront/section-registry';

// Idempotent: wipes the tenant's existing sections and inserts the draft
// stack in order. Keeps sort_order contiguous so the renderer always lists
// them in author-intended sequence.
async function persistSections(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
  sections: StorefrontSection[] | undefined,
) {
  if (!sections || sections.length === 0) return;
  const { error: delErr } = await service
    .from('storefront_sections')
    .delete()
    .eq('tenant_id', tenantId);
  if (delErr) throw delErr;

  const rows = sections
    .filter((s) => isKnownSection(s.type))
    .map((s, idx) => ({
      tenant_id: tenantId,
      type: s.type,
      variant: s.variant,
      sort_order: idx * 10,
      props: s.props ?? {},
      is_visible: s.is_visible !== false,
    }));
  if (rows.length === 0) return;
  const { error: insErr } = await service.from('storefront_sections').insert(rows);
  if (insErr) throw insErr;
}

export async function POST() {
  try {
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const service = createServiceClient();
    const { data: draftRow, error: draftErr } = await service
      .from('onboarding_drafts')
      .select('draft')
      .eq('user_id', user.id)
      .maybeSingle();
    if (draftErr) throw draftErr;
    if (!draftRow?.draft) return badRequest('no draft to launch');

    const draft = draftRow.draft as TenantDraft;

    if (!draft.name) return badRequest('nama restoran belum diisi');
    if (!draft.menu_categories || draft.menu_categories.length === 0) {
      return badRequest('menu belum diisi');
    }

    // Derive slug if the chat didn't set one.
    const slug = draft.slug && isValidSlug(draft.slug) ? draft.slug : generateSlug(draft.name);
    if (!isValidSlug(slug)) return badRequest('slug invalid');

    const payload: TenantDraft = {
      ...draft,
      slug,
      pos_provider: draft.pos_provider ?? 'sajian_native',
    };

    // If the user already owns an active tenant, this is an EDIT pass — patch
    // the tenant + replace the menu instead of inserting a duplicate.
    const { data: existing } = await service
      .from('tenants')
      .select('id, slug')
      .eq('owner_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      // Fetch the existing tenant's pos_provider so we know whether to touch
      // menu_categories. ESB tenants keep their menu in the ESB API — if we
      // delete + re-insert local rows we create shadow data that diverges
      // from ESB and breaks the storefront/menu editor.
      const { data: existingTenant } = await service
        .from('tenants')
        .select('pos_provider')
        .eq('id', existing.id)
        .maybeSingle();

      const tenantUpdate: Record<string, unknown> = {
        name: payload.name,
        tagline: payload.tagline ?? null,
        colors: payload.colors ?? null,
        theme_template: payload.theme_template ?? null,
        logo_url: payload.logo_url ?? null,
        hero_image_url: payload.hero_image_url ?? null,
        operating_hours: payload.operating_hours ?? null,
      };
      const { error: updateErr } = await service
        .from('tenants')
        .update(tenantUpdate)
        .eq('id', existing.id);
      if (updateErr) throw updateErr;

      const isEsb = existingTenant?.pos_provider === 'esb';
      if (!isEsb) {
        // Native tenant — replace menu. Delete-then-insert is simplest and
        // safe under service role.
        const { error: delErr } = await service
          .from('menu_categories')
          .delete()
          .eq('tenant_id', existing.id);
        if (delErr) throw delErr;

        let catIdx = 0;
        for (const cat of payload.menu_categories ?? []) {
          const { data: insertedCat, error: catErr } = await service
            .from('menu_categories')
            .insert({
              tenant_id: existing.id,
              name: cat.name,
              sort_order: catIdx++,
              is_active: true,
            })
            .select('id')
            .single();
          if (catErr) throw catErr;

          let itemIdx = 0;
          for (const item of cat.items) {
            const { error: itemErr } = await service.from('menu_items').insert({
              tenant_id: existing.id,
              category_id: insertedCat.id,
              name: item.name,
              price: item.price,
              description: item.description ?? null,
              sort_order: itemIdx++,
              is_available: true,
            });
            if (itemErr) throw itemErr;
          }
        }
      }

      await persistSections(service, existing.id, payload.sections);

      return NextResponse.json({
        tenant_id: existing.id,
        slug: existing.slug,
        updated: true,
        menu_skipped: isEsb,
      });
    }

    // CREATE path — no existing tenant, run the atomic launch RPC.
    const { data, error } = await service.rpc('onboarding_launch', {
      p_user_id: user.id,
      p_phone: user.phone ?? user.email ?? null,
      p_draft: payload,
    });

    if (error) {
      if (error.message.includes('slug taken')) {
        return NextResponse.json({ error: 'Nama sudah dipakai. Coba nama lain.' }, { status: 409 });
      }
      throw error;
    }

    const result = data as { tenant_id: string; slug: string };
    await persistSections(service, result.tenant_id, payload.sections);

    return NextResponse.json({
      tenant_id: result.tenant_id,
      slug: result.slug,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
