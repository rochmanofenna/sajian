// Central map from section `type` → React component. Each component reads
// `section.variant` internally and dispatches to its variant renderer.

import { About } from '@/components/storefront/sections/About';
import { Announcement } from '@/components/storefront/sections/Announcement';
import { Canvas } from '@/components/storefront/sections/Canvas';
import { Contact } from '@/components/storefront/sections/Contact';
import { FeaturedItems } from '@/components/storefront/sections/FeaturedItems';
import { Gallery } from '@/components/storefront/sections/Gallery';
import { Hero } from '@/components/storefront/sections/Hero';
import { Location } from '@/components/storefront/sections/Location';
import { Promo } from '@/components/storefront/sections/Promo';
import { Social } from '@/components/storefront/sections/Social';
import { Testimonials } from '@/components/storefront/sections/Testimonials';
import type { SectionType } from './section-types';
import type { SectionComponentProps } from './section-types';

type SectionComponent = React.ComponentType<SectionComponentProps>;

// NOTE: the `custom` section isn't registered here. CustomSection lives
// in a server-only module (it depends on @mdx-js/mdx at render time),
// and this registry is imported from client components (PreviewClient).
// The live storefront renderer (server component) handles `type='custom'`
// inline by dynamic-importing CustomSection so the MDX graph never
// enters the client bundle.
export const SECTION_REGISTRY: Partial<Record<SectionType, SectionComponent>> = {
  hero: Hero as SectionComponent,
  about: About as SectionComponent,
  featured_items: FeaturedItems as SectionComponent,
  gallery: Gallery as SectionComponent,
  promo: Promo as SectionComponent,
  contact: Contact as SectionComponent,
  testimonials: Testimonials as SectionComponent,
  social: Social as SectionComponent,
  location: Location as SectionComponent,
  announcement: Announcement as SectionComponent,
  canvas: Canvas as SectionComponent,
};

// List of all known section types including the server-only `custom`.
const ALL_SECTION_TYPES: readonly SectionType[] = [
  'hero',
  'about',
  'featured_items',
  'gallery',
  'promo',
  'contact',
  'testimonials',
  'social',
  'location',
  'announcement',
  'canvas',
  'custom',
];

export function isKnownSection(type: string): type is SectionType {
  return (ALL_SECTION_TYPES as readonly string[]).includes(type);
}
