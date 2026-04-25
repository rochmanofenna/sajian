// Root `/`. Branches on tenant presence:
//   • Tenant (mindiology.sajian.app/) → storefront home
//   • Root (sajian.app/) → marketing landing
// All other tenant routes live under (storefront)/.
//
// Preview mode: when the iframe loads with `?preview=&preview_token=`,
// we verify the token, drop a signed cookie scoped to the tenant
// subdomain, then let StorefrontHome read the active preview off that
// cookie. Subsequent in-iframe clicks (menu, cart, checkout) inherit
// the cookie automatically — no link rewriting required.

import { cookies } from 'next/headers';
import { getPublicTenant } from '@/lib/tenant';
import { StorefrontHome } from '@/components/storefront/StorefrontHome';
import { MarketingHome } from '@/components/marketing/MarketingHome';
import {
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_TTL_SECONDS,
  readPreviewTokenFromSearchParams,
} from '@/lib/preview/mode';

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

export default async function Home({ searchParams }: Props) {
  const tenant = await getPublicTenant();
  const sp = await searchParams;

  if (tenant) {
    // Promote a fresh search-param token into the cookie so deep links
    // (the iframe's first paint) light up preview mode for every page
    // the owner clicks into. After this we read exclusively off the
    // cookie inside StorefrontHome / MenuView / etc.
    const incoming = readPreviewTokenFromSearchParams(sp, tenant.slug);
    if (incoming) {
      const jar = await cookies();
      const remainingMs = incoming.payload.exp * 1000 - Date.now();
      const maxAge = Math.max(
        60,
        Math.min(PREVIEW_COOKIE_TTL_SECONDS, Math.floor(remainingMs / 1000)),
      );
      jar.set(PREVIEW_COOKIE, incoming.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge,
      });
    }
    return <StorefrontHome tenant={tenant} />;
  }
  return <MarketingHome />;
}
