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

export const SECTION_REGISTRY: Record<SectionType, SectionComponent> = {
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

export function isKnownSection(type: string): type is SectionType {
  return Object.prototype.hasOwnProperty.call(SECTION_REGISTRY, type);
}
