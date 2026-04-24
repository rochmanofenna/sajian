import { requirePublicTenant } from '@/lib/tenant';
import { AccountAddressesView } from '@/components/storefront/account/AccountAddressesView';

export default async function AkunAlamatPage() {
  const tenant = await requirePublicTenant();
  return <AccountAddressesView tenant={tenant} />;
}
