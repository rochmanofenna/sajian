// Render a tenant's home page as a stack of sections. Returns null when
// no sections are configured so callers can fall back to the legacy
// theme_template components.

import { SECTION_REGISTRY, isKnownSection } from '@/lib/storefront/section-registry';
import type {
  SectionContext,
  StorefrontSection,
} from '@/lib/storefront/section-types';

interface Props {
  sections: StorefrontSection[];
  ctx: SectionContext;
}

export function StorefrontRenderer({ sections, ctx }: Props) {
  const visible = sections
    .filter((s) => s.is_visible !== false && isKnownSection(s.type))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((section) => {
        const Component = SECTION_REGISTRY[section.type];
        const sectionProps = (section.props ?? {}) as Record<string, unknown>;
        return (
          <Component
            key={section.id}
            section={section}
            ctx={ctx}
            props={sectionProps}
          />
        );
      })}
    </>
  );
}
