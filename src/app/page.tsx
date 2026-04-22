// Root `/`. Branches on tenant presence:
//   • Tenant (mindiology.sajian.app/) → storefront home
//   • Root (sajian.app/) → marketing landing
// All other tenant routes live under (storefront)/.

import { getTenant } from '@/lib/tenant';
import { StorefrontHome } from '@/components/storefront/StorefrontHome';
import { MarketingHome } from '@/components/marketing/MarketingHome';

export default async function Home() {
  const tenant = await getTenant();
  if (tenant) return <StorefrontHome tenant={tenant} />;
  return <MarketingHome />;
}
