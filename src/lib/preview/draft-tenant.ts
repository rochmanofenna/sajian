// Synthetic PublicTenant from an in-progress onboarding draft.
//
// During onboarding the owner has typed some fields (name, colors,
// logo) but no tenants row exists yet — the row is only inserted by
// the launch RPC at the end of /setup. The storefront expects a
// PublicTenant prop everywhere; rather than thread "this is a draft"
// through every component, we synthesize a PublicTenant from the
// draft + slug + sensible defaults. Every render path that was
// already working for launched tenants (StorefrontRenderer, sections,
// templates) keeps its existing contract.
//
// Defaults intentionally chosen so a fresh empty draft still renders
// a coherent hero ("Toko kamu" / Sajian default colors) — the
// preview fills in element-by-element as each chat turn populates
// more fields, never a blank screen.
//
// id is set to the draft owner's user_id (== draft primary key);
// nothing in the storefront render path queries the tenants table
// by this id during preview mode, but giving it the right uuid means
// any existing-tenant code that DOES query (e.g. order submission,
// admin-only paths) hits a clean "row not found" rather than a
// confused match.

import type { TenantDraft } from '@/lib/onboarding/types';
import type { PublicTenant } from '@/lib/tenant';

const DEFAULT_COLORS = {
  primary: '#1B5E3B',
  accent: '#C9A84C',
  background: '#FDF6EC',
  dark: '#1A1A18',
} as const;

export function draftToPublicTenant(opts: {
  draftOwnerId: string;
  slug: string;
  draft: TenantDraft;
}): PublicTenant {
  const { draftOwnerId, slug, draft } = opts;
  return {
    id: draftOwnerId,
    slug,
    name: draft.name?.trim() || 'Toko kamu',
    tagline: draft.tagline ?? null,
    logo_url: draft.logo_url ?? null,
    colors: draft.colors ?? { ...DEFAULT_COLORS },
    support_whatsapp: null,
    country_code: 'ID',
    currency_symbol: 'Rp',
    locale: 'id-ID',
    fallback_coords: null,
    features: {
      reservations: false,
      delivery: false,
      cashier_payment: true,
      member_rewards: false,
      ai_ordering: true,
    },
    tiers: [],
    rewards: [],
    pos_provider: draft.pos_provider ?? 'sajian_native',
    operating_hours: draft.operating_hours ?? null,
    subscription_tier: 'free',
    is_active: false,
    theme_template: draft.theme_template ?? 'modern',
    hero_image_url: draft.hero_image_url ?? null,
    heading_font_family: null,
    body_font_family: null,
    multi_branch_mode: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}
