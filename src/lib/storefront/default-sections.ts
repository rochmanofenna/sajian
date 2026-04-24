// Seeds a fresh tenant with a reasonable section stack: hero, featured
// items, about, contact. Owners reorder / remove / swap variants from chat.

import { nanoid } from 'nanoid';
import type { StorefrontSection } from './section-types';

export function defaultSections(): StorefrontSection[] {
  return [
    {
      id: nanoid(),
      type: 'hero',
      variant: 'gradient',
      sort_order: 0,
      is_visible: true,
      props: {},
    },
    {
      id: nanoid(),
      type: 'featured_items',
      variant: 'horizontal',
      sort_order: 10,
      is_visible: true,
      props: { limit: 4 },
    },
    {
      id: nanoid(),
      type: 'about',
      variant: 'simple',
      sort_order: 20,
      is_visible: true,
      props: {},
    },
    {
      id: nanoid(),
      type: 'contact',
      variant: 'simple',
      sort_order: 30,
      is_visible: true,
      props: {},
    },
  ];
}
