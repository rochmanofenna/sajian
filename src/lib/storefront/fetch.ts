// Server-side loader for section-engine data. Reads storefront_sections +
// menu joins and returns the SectionContext that every registered section
// component consumes. Service-client reads skip RLS (we're already scoped to
// a trusted tenant).

import { createServiceClient } from '@/lib/supabase/service';
import type { PublicTenant } from '@/lib/tenant';
import type { SectionContext, StorefrontSection } from './section-types';
import type { TenantDraft } from '@/lib/onboarding/types';

export async function getStorefrontSections(
  tenantId: string,
): Promise<StorefrontSection[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('storefront_sections')
    .select(
      'id, type, variant, sort_order, props, is_visible, source_jsx, slot_tree, compiled_code, code_hash, compile_status, compile_error',
    )
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[storefront] fetch sections failed:', error.message);
    return [];
  }
  // For custom sections, merge the top-level codegen columns into `props`
  // so CustomSection receives them without a second DB read.
  return (data ?? []).map((row) => {
    const r = row as StorefrontSection & Record<string, unknown>;
    if (r.type === 'custom') {
      const merged = {
        ...(r.props ?? {}),
        source_jsx: r.source_jsx ?? null,
        slot_tree: r.slot_tree ?? null,
        compiled_code: r.compiled_code ?? null,
        code_hash: r.code_hash ?? null,
        compile_status: r.compile_status ?? null,
        compile_error: r.compile_error ?? null,
      };
      return { ...r, props: merged as Record<string, unknown> };
    }
    return r;
  }) as StorefrontSection[];
}

// Draft-source variant. Pulls onboarding_drafts.draft for the supplied
// owner and translates draft.sections into the same StorefrontSection
// shape the renderer consumes. Used by preview mode — the iframe URL
// carries a verified preview_token so we already know the requester
// owns this draft.
//
// Custom sections in the draft carry their codegen fields nested under
// props (the onboarding store keeps the same shape), so we don't need
// the join-flatten dance the published-source variant does.
export async function getStorefrontSectionsFromDraft(
  draftId: string,
): Promise<{ sections: StorefrontSection[]; draft: TenantDraft } | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('onboarding_drafts')
    .select('id, draft')
    .eq('id', draftId)
    .maybeSingle();
  if (error || !data) return null;
  const draft = (data.draft ?? {}) as TenantDraft;
  const list = (draft.sections ?? []) as StorefrontSection[];
  // Defensive copy + sort + dedupe of the codegen fields so the
  // renderer sees the same shape it gets from getStorefrontSections.
  const sections: StorefrontSection[] = list
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => ({ ...s, props: { ...(s.props ?? {}) } }));
  return { sections, draft };
}

export function buildSectionContextFromDraft(
  tenant: PublicTenant,
  draft: TenantDraft,
): SectionContext {
  const cats = draft.menu_categories ?? [];
  return {
    name: draft.name ?? tenant.name,
    tagline: draft.tagline ?? tenant.tagline ?? null,
    logoUrl: draft.logo_url ?? tenant.logo_url ?? null,
    heroImageUrl: draft.hero_image_url ?? tenant.hero_image_url ?? null,
    colors: draft.colors ?? tenant.colors,
    menuCategories: cats.map((c) => ({
      name: c.name,
      items: c.items
        .filter((i) => i.is_available !== false)
        .map((i) => ({
          name: i.name,
          description: i.description,
          price: i.price,
          image_url: i.image_url ?? null,
        })),
    })),
    whatsapp: tenant.support_whatsapp ?? null,
    address: draft.location ?? null,
  };
}

export async function buildSectionContext(
  tenant: PublicTenant,
): Promise<SectionContext> {
  const sb = createServiceClient();
  const { data: cats } = await sb
    .from('menu_categories')
    .select('id, name, sort_order')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const { data: items } = await sb
    .from('menu_items')
    .select('name, description, price, image_url, category_id, sort_order, is_available')
    .eq('tenant_id', tenant.id)
    .eq('is_available', true)
    .order('sort_order', { ascending: true });

  const byCat = new Map<string, SectionContext['menuCategories'][number]>();
  for (const c of cats ?? []) {
    byCat.set(c.id as string, { name: c.name as string, items: [] });
  }
  for (const item of items ?? []) {
    const bucket = byCat.get(item.category_id as string);
    if (!bucket) continue;
    bucket.items.push({
      name: item.name as string,
      description: (item.description as string | null) ?? undefined,
      price: item.price as number,
      image_url: (item.image_url as string | null) ?? null,
    });
  }

  return {
    name: tenant.name,
    tagline: tenant.tagline ?? null,
    logoUrl: tenant.logo_url ?? null,
    heroImageUrl: tenant.hero_image_url ?? null,
    colors: tenant.colors,
    menuCategories: Array.from(byCat.values()),
    whatsapp: tenant.support_whatsapp ?? null,
    address: null,
  };
}
