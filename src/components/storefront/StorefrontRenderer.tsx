// Render a tenant's home page as a stack of sections. Returns null when
// no sections are configured so callers can fall back to the legacy
// theme_template components.
//
// This client-safe renderer dispatches the registry-backed sections.
// For `type='custom'`, see `StorefrontRendererServer` in
// `./StorefrontRenderer.server.tsx` — the MDX runtime needs a server
// context, and keeping it out of this file prevents PreviewClient
// (which is 'use client') from dragging mdx into the client bundle.

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
        const sectionProps = (section.props ?? {}) as Record<string, unknown>;
        const Component = SECTION_REGISTRY[section.type];
        // Client-safe renderer ignores `custom`; preview shows a
        // tenant-tinted placeholder instead of trying to execute MDX.
        const rendered = Component ? (
          <Component section={section} ctx={ctx} props={sectionProps} />
        ) : (
          <CustomPlaceholder ctx={ctx} />
        );
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
              {rendered}
            </SectionErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}

function CustomPlaceholder({ ctx }: { ctx: SectionContext }) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className="max-w-xl mx-auto rounded-2xl border px-5 py-6 text-center"
        style={{
          borderColor: `${ctx.colors.primary}22`,
          background: `${ctx.colors.primary}08`,
        }}
      >
        <div
          className="text-xs uppercase tracking-[0.18em] opacity-70"
          style={{ color: ctx.colors.primary }}
        >
          Bagian kustom
        </div>
        <div className="mt-2 text-sm opacity-80">
          Tampil setelah toko di-publish.
        </div>
      </div>
    </section>
  );
}
