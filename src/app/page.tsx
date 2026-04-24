// Root `/`. Branches on tenant presence:
//   • Tenant (mindiology.sajian.app/) → storefront home
//   • Root (sajian.app/) → marketing landing
// All other tenant routes live under (storefront)/.

import { getPublicTenant } from '@/lib/tenant';
import { StorefrontHome } from '@/components/storefront/StorefrontHome';
import { MarketingHome } from '@/components/marketing/MarketingHome';

export default async function Home() {
  const tenant = await getPublicTenant();
  if (tenant) return <StorefrontHome tenant={tenant} />;
  return <MarketingHome />;
}

export const dynamic = 'force-dynamic';
