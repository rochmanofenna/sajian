import { requirePublicTenant } from '@/lib/tenant';
import { CartView } from '@/components/storefront/CartView';

export default async function CartPage() {
  const tenant = await requirePublicTenant();
  return <CartView tenant={tenant} />;
}
