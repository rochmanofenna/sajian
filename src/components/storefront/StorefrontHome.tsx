// Tenant storefront landing. Prefers the section engine when the tenant has
// storefront_sections rows; falls back to the legacy theme_template tree for
// tenants that haven't been re-launched through the section-aware onboarding.

import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';
import { StoreFooter } from './StoreFooter';
import { StorefrontRenderer } from './StorefrontRenderer';
import {
  buildSectionContext,
  getStorefrontSections,
} from '@/lib/storefront/fetch';

export async function StorefrontHome({ tenant }: { tenant: PublicTenant }) {
  const sections = await getStorefrontSections(tenant.id);

  if (sections.length > 0) {
    const ctx = await buildSectionContext(tenant);
    return (
      <div
        className="flex flex-col flex-1 min-h-screen"
        style={{ background: tenant.colors.background, color: tenant.colors.dark }}
      >
        <div className="flex-1">
          <StorefrontRenderer sections={sections} ctx={ctx} />
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
