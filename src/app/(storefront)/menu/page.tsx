import { requirePublicTenant } from '@/lib/tenant';
import { MenuView } from '@/components/storefront/MenuView';

export default async function MenuPage() {
  const tenant = await requirePublicTenant();
  return <MenuView tenant={tenant} />;
}
