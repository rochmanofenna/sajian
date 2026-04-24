// Root layout. Resolves tenant once per request and injects:
//   • CSS variables for tenant colors (scoped to <html style>)
//   • `data-template` attribute so template-level CSS can target font + tone
//   • TenantProvider so client components don't refetch
//   • per-tenant <title>, favicon, description
//
// Root domain (no tenant) falls back to Sajian-branded marketing defaults.

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getTenant, toPublicTenant } from '@/lib/tenant';
import { TenantProvider } from '@/context/TenantContext';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

// Loaded globally so both the marketing site and any template that wants
// a serif (kedai, classic) can use it without a per-route font dance.
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

  // Always emit the tenant color variables — apex / app pages fall
  // back to neutral Sajian defaults so `bg-[var(--color-background)]`
  // on <body> resolves to a real color instead of an unset var (which
  // strips the page to transparent bg + unstyled text, making the
  // whole admin dashboard read as "CSS didn't load").
  const themeStyle = {
    '--color-primary': tenant?.colors.primary ?? '#111827',
    '--color-accent': tenant?.colors.accent ?? '#6B7280',
    '--color-background': tenant?.colors.background ?? '#FFFFFF',
    '--color-dark': tenant?.colors.dark ?? '#0F172A',
  } as React.CSSProperties;

  const template = tenant?.theme_template ?? 'modern';

  return (
    <html
      lang={tenant?.locale ?? 'id-ID'}
      className={`${jakarta.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
      style={themeStyle}
      data-template={template}
    >
      <body className="min-h-full flex flex-col bg-[var(--color-background)] text-[var(--color-dark)] font-sans">
        {tenant ? <TenantProvider tenant={toPublicTenant(tenant)}>{children}</TenantProvider> : children}
      </body>
    </html>
  );
}
