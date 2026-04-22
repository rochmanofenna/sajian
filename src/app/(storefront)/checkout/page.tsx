import { requirePublicTenant } from '@/lib/tenant';
import { CheckoutView } from '@/components/storefront/CheckoutView';

export default async function CheckoutPage() {
  const tenant = await requirePublicTenant();
  return <CheckoutView tenant={tenant} />;
}
