// Root `/`. Branches on tenant presence:
//   • Tenant (mindiology.sajian.app/) → storefront home
//   • Root (sajian.app/) → marketing landing
// All other tenant routes live under (storefront)/.
//
// Preview mode: the proxy promotes ?preview_token= into a cookie on
// the response, so by the time StorefrontHome runs the cookie is the
// only signal we need to read (via getPreviewMode). This page stays
// stateless — Next.js disallows cookie mutation in Server Components
// anyway.

import { getPublicTenant } from '@/lib/tenant';
import { StorefrontHome } from '@/components/storefront/StorefrontHome';
import { MarketingHome } from '@/components/marketing/MarketingHome';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams;
  if (sp?.preview_token || sp?.preview) {
    // Drafts must never be indexed — they're transient and owner-only.
    return { robots: { index: false, follow: false } };
  }
  return {};
}

export default async function Home() {
  const tenant = await getPublicTenant();
  if (tenant) {
    return <StorefrontHome tenant={tenant} />;
  }
  return <MarketingHome />;
}
