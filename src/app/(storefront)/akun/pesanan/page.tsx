import { requirePublicTenant } from '@/lib/tenant';
import { AccountOrdersView } from '@/components/storefront/account/AccountOrdersView';

export default async function AkunPesananPage() {
  const tenant = await requirePublicTenant();
  return <AccountOrdersView tenant={tenant} />;
}
