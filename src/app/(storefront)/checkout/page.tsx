import { requireTenant } from '@/lib/tenant';
import { CheckoutView } from '@/components/storefront/CheckoutView';

export default async function CheckoutPage() {
  const tenant = await requireTenant();
  return <CheckoutView tenant={tenant} />;
}
