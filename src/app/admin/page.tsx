import { requirePublicTenant } from '@/lib/tenant';
import { OrderFeed } from '@/components/admin/OrderFeed';

export default async function AdminDashboardPage() {
  const tenant = await requirePublicTenant();
  return <OrderFeed tenant={tenant} />;
}
