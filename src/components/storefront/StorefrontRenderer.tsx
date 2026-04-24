// Render a tenant's home page as a stack of sections. Returns null when
// no sections are configured so callers can fall back to the legacy
// theme_template components.
//
// Each section enters with a fade + lift animation and re-keys when its
// variant changes so switching "hero → fullscreen" crossfades instead of
// jumping. Colors transition smoothly via a container-level CSS rule that
// propagates to child sections through CSS vars.

import { SECTION_REGISTRY, isKnownSection } from '@/lib/storefront/section-registry';
import type {
  SectionContext,
  StorefrontSection,
} from '@/lib/storefront/section-types';
import { SectionErrorBoundary } from './SectionErrorBoundary';

interface Props {
  sections: StorefrontSection[];
  ctx: SectionContext;
  tenantId?: string;
}

export function StorefrontRenderer({ sections, ctx, tenantId }: Props) {
  const visible = sections
    .filter((s) => s.is_visible !== false && isKnownSection(s.type))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (visible.length === 0) return null;

  return (
    <div className="sj-sections">
      {visible.map((section, i) => {
        const Component = SECTION_REGISTRY[section.type];
        const sectionProps = (section.props ?? {}) as Record<string, unknown>;
        return (
          <div
            // Keying by id + variant re-mounts the subtree when the variant
            // flips, so the new layout fades in instead of ping-ponging on
            // mismatched children.
            key={`${section.id}:${section.variant}`}
            className="sj-section-slot"
            style={{ animationDelay: `${Math.min(i * 80, 360)}ms` }}
          >
            <SectionErrorBoundary section={section} ctx={ctx} tenantId={tenantId}>
              <Component section={section} ctx={ctx} props={sectionProps} />
            </SectionErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
