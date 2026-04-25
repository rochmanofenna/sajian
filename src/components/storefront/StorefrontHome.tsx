// Tenant storefront landing. Prefers the section engine when the tenant has
// storefront_sections rows; falls back to the legacy theme_template tree for
// tenants that haven't been re-launched through the section-aware onboarding.
//
// Preview mode swaps the source: when getPreviewMode() reports an active
// session, we read the section list + context from the owner's
// onboarding_drafts.draft instead. The published row stays untouched.

import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';
import { StoreFooter } from './StoreFooter';
import { StorefrontRendererServer } from './StorefrontRenderer.server';
import {
  buildSectionContext,
  buildSectionContextFromDraft,
  getStorefrontSections,
  getStorefrontSectionsFromDraft,
} from '@/lib/storefront/fetch';
import { getPreviewMode } from '@/lib/preview/mode';
import { PreviewModeBanner } from './PreviewModeBanner';

export async function StorefrontHome({ tenant }: { tenant: PublicTenant }) {
  const preview = await getPreviewMode(tenant);

  if (preview) {
    const draftLoad = await getStorefrontSectionsFromDraft(preview.draftId);
    if (draftLoad && draftLoad.sections.length > 0) {
      const ctx = buildSectionContextFromDraft(tenant, draftLoad.draft);
      return (
        <div
          className="flex flex-col flex-1 min-h-screen"
          style={{ background: ctx.colors.background, color: ctx.colors.dark }}
        >
          <PreviewModeBanner />
          <div className="flex-1">
            <StorefrontRendererServer
              sections={draftLoad.sections}
              ctx={ctx}
              tenantId={tenant.id}
            />
          </div>
          <StoreFooter tenant={tenant} />
        </div>
      );
    }
  }

  const sections = await getStorefrontSections(tenant.id);

  if (sections.length > 0) {
    const ctx = await buildSectionContext(tenant);
    return (
      <div
        className="flex flex-col flex-1 min-h-screen"
        style={{ background: tenant.colors.background, color: tenant.colors.dark }}
      >
        <div className="flex-1">
          <StorefrontRendererServer sections={sections} ctx={ctx} tenantId={tenant.id} />
        </div>
        <StoreFooter tenant={tenant} />
      </div>
    );
  }

  const { Home } = getTemplate(tenant.theme_template);
  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <div className="flex-1">
        <Home tenant={tenant} />
      </div>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
