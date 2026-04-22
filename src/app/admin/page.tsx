import { requireTenant } from '@/lib/tenant';
import { OrderFeed } from '@/components/admin/OrderFeed';

export default async function AdminDashboardPage() {
  const tenant = await requireTenant();
  return <OrderFeed tenant={tenant} />;
}
