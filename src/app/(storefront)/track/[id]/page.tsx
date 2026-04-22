import { requireTenant } from '@/lib/tenant';
import { TrackView } from '@/components/storefront/TrackView';

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenant();
  return <TrackView tenant={tenant} orderId={id} />;
}
