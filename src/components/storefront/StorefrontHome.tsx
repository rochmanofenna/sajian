// Tenant storefront landing. Delegates to the template variant selected by
// tenant.theme_template and always renders the shared footer so owners have
// a way into /admin from any page.

import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';
import { StoreFooter } from './StoreFooter';

export function StorefrontHome({ tenant }: { tenant: PublicTenant }) {
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
