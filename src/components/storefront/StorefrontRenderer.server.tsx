// Server-side renderer. Extends the client-safe renderer with support
// for the `custom` section type, which depends on the MDX runtime
// (server-only). Live storefront reads land here; the onboarding
// preview iframe uses the client-safe renderer instead.

import { SECTION_REGISTRY, isKnownSection } from '@/lib/storefront/section-registry';
import type {
  SectionContext,
  StorefrontSection,
} from '@/lib/storefront/section-types';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { CustomSection } from './sections/CustomSection';

interface Props {
  sections: StorefrontSection[];
  ctx: SectionContext;
  tenantId?: string;
}

export function StorefrontRendererServer({ sections, ctx, tenantId }: Props) {
  const visible = sections
    .filter((s) => s.is_visible !== false && isKnownSection(s.type))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (visible.length === 0) return null;

  return (
    <div className="sj-sections">
      {visible.map((section, i) => {
        const sectionProps = (section.props ?? {}) as Record<string, unknown>;
        const rendered =
          section.type === 'custom' ? (
            <CustomSection section={section} ctx={ctx} props={sectionProps} />
          ) : (
            (() => {
              const Component = SECTION_REGISTRY[section.type];
              if (!Component) return null;
              return <Component section={section} ctx={ctx} props={sectionProps} />;
            })()
          );
        return (
          <div
            key={`${section.id}:${section.variant}`}
            className="sj-section-slot"
            style={{ animationDelay: `${Math.min(i * 80, 360)}ms` }}
          >
            <SectionErrorBoundary section={section} ctx={ctx} tenantId={tenantId}>
              {rendered}
            </SectionErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
