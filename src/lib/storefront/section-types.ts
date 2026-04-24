// Shared types for storefront sections. Kept separate from
// src/lib/onboarding/types so storefront code doesn't drag onboarding state
// into its bundle.

import type { SectionType, StorefrontSection, TenantColors } from '@/lib/onboarding/types';

export type { SectionType, StorefrontSection } from '@/lib/onboarding/types';

// Runtime catalog of variants each section supports. The onboarding chat
// route serializes this into Claude's system prompt so the AI only ever
// picks variants that actually render.
export const SECTION_VARIANTS: Record<SectionType, readonly string[]> = {
  hero: ['gradient', 'minimal', 'split', 'fullscreen', 'editorial'],
  about: ['simple', 'with_image', 'story'],
  featured_items: ['horizontal', 'grid', 'spotlight'],
  gallery: ['grid', 'carousel', 'featured'],
  promo: ['banner', 'card', 'countdown'],
  contact: ['simple', 'with_map'],
  testimonials: ['cards', 'quotes', 'grid'],
  social: ['icons', 'feed'],
  location: ['map'],
  announcement: ['bar', 'modal'],
};

// Props every section receives in addition to its own `props` bag. These
// come from the tenant record so section components never have to re-fetch.
export interface SectionContext {
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  colors: TenantColors;
  menuCategories: { name: string; items: Array<{ name: string; description?: string; price: number; image_url?: string | null }> }[];
  whatsapp?: string | null;
  address?: string | null;
}

// Shape passed to every registered section component. `P` is the section's
// own props bag (loosely typed on the wire as Record<string, unknown> but
// each section component narrows it to its own optional fields).
export interface SectionComponentProps<P = Record<string, unknown>> {
  section: StorefrontSection;
  ctx: SectionContext;
  props: P;
}
