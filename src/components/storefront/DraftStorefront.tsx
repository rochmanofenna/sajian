// Renders an in-progress onboarding draft as a live storefront, for
// tenants that don't have a `tenants` row yet. Companion to
// StorefrontHome (which handles launched tenants + their preview-mode
// branch); together they cover both halves of the owner's preview
// experience.
//
// Why this exists: during onboarding the owner watches their /setup
// preview iframe to see the storefront fill in as they chat. Pre-fix,
// the iframe pointed at <slug>.sajian.app, which had no tenants row
// → root page.tsx fell through to MarketingHome → owner saw the
// Sajian landing page in their preview tab. This component is the
// "draft path" the iframe now hits when the preview cookie verifies
// + the slug matches the URL.
//
// Structure mirrors StorefrontHome's preview branch: synthetic
// PublicTenant from draft, SectionContext from draft, sections
// from draft.sections (or default scaffold when the draft has none
// yet), wrapped in PreviewModeBanner so the existing
// PreviewLiveReloadClient picks up postMessage('sajian:reload')
// debounced from setup/page.tsx — every chat turn that mutates
// the draft triggers a re-render with no extra wiring.

import type { TenantDraft } from '@/lib/onboarding/types';
import { draftToPublicTenant } from '@/lib/preview/draft-tenant';
import { defaultSections } from '@/lib/storefront/default-sections';
import { buildSectionContextFromDraft } from '@/lib/storefront/fetch';
import { StoreFooter } from './StoreFooter';
import { StorefrontRendererServer } from './StorefrontRenderer.server';
import { PreviewModeBanner } from './PreviewModeBanner';

export function DraftStorefront(props: {
  draftOwnerId: string;
  slug: string;
  draft: TenantDraft;
}) {
  const tenant = draftToPublicTenant({
    draftOwnerId: props.draftOwnerId,
    slug: props.slug,
    draft: props.draft,
  });
  const ctx = buildSectionContextFromDraft(tenant, props.draft);
  // Always render a section scaffold — section components have
  // empty-state copy of their own (About has fallback paragraph,
  // FeaturedItems shows an empty grid, Hero shows the Lockup with
  // whatever name + logo are present). Each chat turn fills in
  // more without changing the page structure.
  const rawSections =
    props.draft.sections && props.draft.sections.length > 0
      ? props.draft.sections
      : defaultSections();

  // Render every section's CTA with its full visual treatment but
  // make it behaviorally inert. The owner needs to see the storefront
  // EXACTLY the way their customers will see it — that's the entire
  // demo-magic premise — so hiding "Lihat Menu" / "Pesan Sekarang" /
  // etc. (the previous fix) was wrong. The actual problem was that
  // those CTAs navigated the iframe into a non-existent route on an
  // unlaunched subdomain, recursing back through /setup. Solution:
  // keep cta_visible as the draft set it, but override cta_href to
  // an in-page anchor (#preview-noop) that doesn't navigate. Section
  // components render <a href="#preview-noop">, click triggers an
  // empty hash change (no element matches, no scroll, no recursion).
  // Live-launch path is untouched: this component is never reached
  // for tenants with a real `tenants` row — StorefrontHome takes over
  // there, and CTAs render with their original hrefs.
  const sections = rawSections.map((s) => ({
    ...s,
    props: { ...(s.props ?? {}), cta_href: '#preview-noop' },
  }));

  return (
    <div
      className="flex flex-col flex-1 min-h-screen"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <PreviewModeBanner />
      <div className="flex-1">
        <StorefrontRendererServer sections={sections} ctx={ctx} tenantId={tenant.id} />
      </div>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
