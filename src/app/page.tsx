// Root `/`. Branches on tenant presence:
//   • Tenant (mindiology.sajian.app/) → storefront home
//   • Root (sajian.app/) → marketing landing
// All other tenant routes live under (storefront)/.

import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { getPublicTenant } from '@/lib/tenant';
import { StorefrontHome } from '@/components/storefront/StorefrontHome';
import { MarketingHome } from '@/components/marketing/MarketingHome';

// Marketing-only fonts — scoped to the wrapper so tenant storefronts don't
// pay for the extra weight. Plus Jakarta Sans is loaded globally in layout.
const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export default async function Home() {
  const tenant = await getPublicTenant();
  if (tenant) return <StorefrontHome tenant={tenant} />;
  return (
    <div className={`${fraunces.variable} ${jetbrainsMono.variable}`}>
      <MarketingHome />
    </div>
  );
}
