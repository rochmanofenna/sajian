'use client';

// Live-updating preview renderer. Parent (/setup) sends `sajian:draft`
// postMessage events whenever the owner edits through chat; we re-render
// with the new draft. On mount we announce `sajian:preview:ready` so the
// parent can replay the current draft immediately — handles the race when
// the iframe mounts after a state change.
//
// When the draft carries a `sections` stack (the section-based engine), we
// render via StorefrontRenderer — same component the live storefront will
// use once migrated. Legacy drafts without sections fall back to the old
// phone-framed menu list so mid-flight owners don't see a regression.

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { MenuItemDraft, TenantDraft } from '@/lib/onboarding/types';
import { StorefrontRenderer } from '@/components/storefront/StorefrontRenderer';
import type { SectionContext } from '@/lib/storefront/section-types';
import { configuredAppOrigin } from '@/lib/security/preview-origin';

const PREVIEW_MSG_DRAFT = 'sajian:draft';
const PREVIEW_MSG_READY = 'sajian:preview:ready';

// When the preview runs on its own origin (preview.sajian.app) the
// parent's origin is fixed by env and must be explicitly trusted. On
// localhost dev both sides share an origin, so we fall back to
// window.location.origin which still works for postMessage pinning.
function expectedParentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return configuredAppOrigin() ?? window.location.origin;
}

const DEFAULT_COLORS = {
  primary: '#1B5E3B',
  accent: '#C9A84C',
  background: '#FDF6EC',
  dark: '#1A1A18',
};

function draftToContext(draft: TenantDraft): SectionContext {
  return {
    name: draft.name ?? 'Nama Restoran',
    tagline: draft.tagline ?? null,
    logoUrl: draft.logo_url ?? null,
    heroImageUrl: draft.hero_image_url ?? null,
    colors: draft.colors ?? DEFAULT_COLORS,
    menuCategories: (draft.menu_categories ?? []).map((c) => ({
      name: c.name,
      items: c.items.map((i) => ({
        name: i.name,
        description: i.description,
        price: i.price,
        image_url: i.image_url ?? null,
      })),
    })),
    whatsapp: null,
    address: draft.location ?? null,
  };
}

export function PreviewClient({ initial }: { initial: TenantDraft }) {
  const [draft, setDraft] = useState<TenantDraft>(initial);

  useEffect(() => {
    const parentOrigin = expectedParentOrigin();
    function onMessage(e: MessageEvent) {
      // Pin to the configured parent origin. In the cross-origin prod
      // setup this rejects anything that isn't the real /setup page.
      if (!parentOrigin || e.origin !== parentOrigin) return;
      const data = e.data as { type?: string; draft?: TenantDraft } | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === PREVIEW_MSG_DRAFT && data.draft) {
        setDraft(data.draft);
      }
    }
    window.addEventListener('message', onMessage);
    // Ask parent to replay the current draft — avoids the race where the
    // parent sent its update before we were mounted. Use the pinned
    // parent origin so the ready message isn't readable by another frame.
    try {
      window.parent?.postMessage(
        { type: PREVIEW_MSG_READY },
        parentOrigin || window.location.origin,
      );
    } catch {
      // Parent may be missing in a detached tab; ignore.
    }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const colors = draft.colors ?? DEFAULT_COLORS;
  const sections = draft.sections ?? [];
  const hasSections = sections.length > 0;

  if (hasSections) {
    return (
      <div className="min-h-screen" style={{ background: colors.background, color: colors.dark }}>
        {/* StorefrontRenderer wraps each section in SectionErrorBoundary already,
            so a bad draft in preview isolates to the section that crashed. */}
        <StorefrontRenderer sections={sections} ctx={draftToContext(draft)} />
      </div>
    );
  }

  // Legacy fallback — the pre-section preview.
  const categories = draft.menu_categories ?? [];
  const hasMenu = categories.some((c) => c.items.length > 0);

  return (
    <div className="min-h-screen" style={{ background: colors.background, color: colors.dark }}>
      {draft.hero_image_url && (
        <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.hero_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to bottom, transparent 50%, ${colors.background} 100%)` }}
          />
        </div>
      )}

      <header
        className="sticky top-0 z-10 px-4 h-14 flex items-center border-b backdrop-blur"
        style={{
          borderColor: `${colors.primary}22`,
          background: `${colors.background}CC`,
        }}
      >
        {draft.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.logo_url} alt="" className="h-8 w-8 rounded-md object-cover" />
        ) : (
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-white text-xs font-semibold"
            style={{ background: colors.primary }}
          >
            {(draft.name ?? 'Sa').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="ml-3 min-w-0">
          <div className="font-semibold truncate" style={{ color: colors.primary }}>
            {draft.name ?? 'Nama Restoran'}
          </div>
          {draft.tagline && (
            <div className="text-[11px] opacity-70 truncate">{draft.tagline}</div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5">
        {!hasMenu ? (
          <div className="text-center py-16 opacity-60 text-sm">
            Menu akan muncul di sini.
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => (
              <section key={cat.name}>
                <h2
                  className="text-base font-semibold mb-2 uppercase tracking-wide"
                  style={{ color: colors.primary }}
                >
                  {cat.name}
                </h2>
                <ul className="space-y-2 list-none p-0 m-0">
                  {cat.items.map((item) => (
                    <ItemRow key={item.name} item={item} colors={colors} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ItemRow({
  item,
  colors,
}: {
  item: MenuItemDraft;
  colors: { primary: string; accent: string; background: string; dark: string };
}) {
  const unavailable = item.is_available === false;
  return (
    <li
      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border"
      style={{
        borderColor: `${colors.primary}15`,
        opacity: unavailable ? 0.55 : 1,
      }}
    >
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt=""
          className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="h-14 w-14 rounded-lg flex-shrink-0"
          style={{ background: `${colors.primary}10` }}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <div className="font-medium text-sm leading-tight break-words flex-1 min-w-0">
            {item.name}
          </div>
          {unavailable && (
            <span
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: `${colors.dark}14`, color: colors.dark }}
            >
              Habis
            </span>
          )}
        </div>
        {item.description && (
          <div className="text-[11px] opacity-60 line-clamp-2 mt-0.5 leading-snug break-words">
            {item.description}
          </div>
        )}
        <div
          className="mt-1 text-sm font-semibold"
          style={{ color: colors.primary }}
        >
          {formatCurrency(item.price, 'Rp ', 'id-ID')}
        </div>
      </div>
    </li>
  );
}
