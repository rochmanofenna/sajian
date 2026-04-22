import { requireTenant } from '@/lib/tenant';
import { MenuView } from '@/components/storefront/MenuView';

export default async function MenuPage() {
  const tenant = await requireTenant();
  return <MenuView tenant={tenant} />;
}
