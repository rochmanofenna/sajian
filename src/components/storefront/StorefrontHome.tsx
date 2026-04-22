// Tenant storefront landing. Delegates to the template variant selected by
// tenant.theme_template. The shared fetching logic lives in templates/types
// and templates/useMenuData; this file only orchestrates which Home renders.

import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';

export function StorefrontHome({ tenant }: { tenant: PublicTenant }) {
  const { Home } = getTemplate(tenant.theme_template);
  return <Home tenant={tenant} />;
}
