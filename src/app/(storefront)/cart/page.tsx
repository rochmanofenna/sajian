import { requireTenant } from '@/lib/tenant';
import { CartView } from '@/components/storefront/CartView';

export default async function CartPage() {
  const tenant = await requireTenant();
  return <CartView tenant={tenant} />;
}
