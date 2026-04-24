'use client';

// Per-section error boundary. Wraps each rendered section so one bad tree
// never takes down the whole storefront. Falls back to a subtle tenant-
// tinted card sized to typical section height so the layout stays
// recognisable. Logs section_id + tenant_id so we can diagnose from
// Vercel logs / Sentry without rummaging.

import { Component, type ReactNode } from 'react';
import type { SectionContext, StorefrontSection } from '@/lib/storefront/section-types';

interface Props {
  section: StorefrontSection;
  ctx: SectionContext;
  tenantId?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    const { section, tenantId } = this.props;
    // Pipes into Vercel function logs; Sentry plugin (if added later)
    // picks it up via console.error hook.
    console.error('[section] render crashed', {
      section_id: section.id,
      section_type: section.type,
      section_variant: section.variant,
      tenant_id: tenantId,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 4).join('\n'),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { ctx, section } = this.props;
    return (
      <section
        className="px-6 py-10"
        style={{ background: ctx.colors.background, color: ctx.colors.dark }}
      >
        <div
          className="max-w-xl mx-auto rounded-2xl border px-5 py-6 text-center"
          style={{
            minHeight: 160,
            borderColor: `${ctx.colors.primary}22`,
            background: `${ctx.colors.primary}08`,
          }}
        >
          <div
            className="text-xs uppercase tracking-[0.18em] opacity-70"
            style={{ color: ctx.colors.primary }}
          >
            {section.type}
          </div>
          <div className="mt-2 text-sm font-medium opacity-85">
            Bagian ini sedang diperbaiki.
          </div>
          <div className="mt-1 text-xs opacity-60">
            Bagian lain di halaman tetap berfungsi normal.
          </div>
        </div>
      </section>
    );
  }
}
