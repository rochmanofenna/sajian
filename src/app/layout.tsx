// Root layout. Resolves tenant once per request and injects:
//   • CSS variables for tenant colors (scoped to <html style>)
//   • TenantProvider so client components don't refetch
//   • per-tenant <title>, favicon, description
//
// Root domain (no tenant) falls back to Sajian-branded marketing defaults.

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { getTenant, toPublicTenant } from '@/lib/tenant';
import { TenantProvider } from '@/context/TenantContext';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  if (!tenant) {
    return {
      title: 'Sajian — Restaurant OS for Indonesia',
      description: 'AI-powered ordering platform. Launch your restaurant app in minutes.',
    };
  }
  return {
    title: tenant.name,
    description: tenant.tagline ?? `Order from ${tenant.name}`,
    icons: tenant.logo_url ? [{ url: tenant.logo_url }] : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();

  const themeStyle = tenant
    ? ({
        '--color-primary': tenant.colors.primary,
        '--color-accent': tenant.colors.accent,
        '--color-background': tenant.colors.background,
        '--color-dark': tenant.colors.dark,
      } as React.CSSProperties)
    : undefined;

  return (
    <html lang={tenant?.locale ?? 'id-ID'} className={`${jakarta.variable} h-full antialiased`} style={themeStyle}>
      <body className="min-h-full flex flex-col bg-[var(--color-background)] text-[var(--color-dark)] font-sans">
        {tenant ? <TenantProvider tenant={toPublicTenant(tenant)}>{children}</TenantProvider> : children}
      </body>
    </html>
  );
}
