import { requirePublicTenant } from '@/lib/tenant';
import { AccountProfileView } from '@/components/storefront/account/AccountProfileView';

export default async function AkunPage() {
  const tenant = await requirePublicTenant();
  return <AccountProfileView tenant={tenant} />;
}
