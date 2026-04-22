import { requirePublicTenant } from '@/lib/tenant';
import { TrackView } from '@/components/storefront/TrackView';

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requirePublicTenant();
  return <TrackView tenant={tenant} orderId={id} />;
}
