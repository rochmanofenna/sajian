// Root layout. Resolves tenant once per request and injects:
//   • CSS variables for tenant colors (scoped to <html style>)
//   • `data-template` attribute so template-level CSS can target font + tone
//   • TenantProvider so client components don't refetch
//   • per-tenant <title>, favicon, description
//
// Root domain (no tenant) falls back to Sajian-branded marketing defaults.

import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getTenant, toPublicTenant } from '@/lib/tenant';
import { TenantProvider } from '@/context/TenantContext';

// Mobile-first viewport. Without this every page renders at the
// browser's "desktop width" fallback (~980px) on phones and zooms
// out to fit, which made every Sajian screen unreadable on actual
// phones. Indonesian restaurant owners primarily onboard via mobile,
// and customers always do — viewport meta is the single highest-
// leverage mobile fix in the app. Keep maximumScale unset so users
// can still pinch-zoom (a11y, never lock that).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No themeColor here — tenant colors aren't known at the type's
  // resolution time. Set per-tenant via the inline <html style>
  // theme vars instead, which the browser address-bar tinting on
  // iOS Safari + Android Chrome already picks up.
};

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

  // Per-tenant typography. Owners pick any Google Fonts family via
  // chat (update_tenant_setting key=heading_font_family). When set,
  // we emit a <link> to the Google Fonts CSS endpoint and expose
  // --font-heading / --font-body CSS vars. Null falls back to the
  // template default (Plus Jakarta Sans / Fraunces). The list of
  // weights stays generous (300..800) since heading + body cover
  // most cases without two separate roundtrips.
  const headingFamily = tenant?.heading_font_family ?? null;
  const bodyFamily = tenant?.body_font_family ?? null;
  const fontFamilies = Array.from(
    new Set([headingFamily, bodyFamily].filter((f): f is string => !!f && f.trim().length > 0)),
  );
  const googleFontsHref =
    fontFamilies.length > 0
      ? `https://fonts.googleapis.com/css2?${fontFamilies
          .map(
            (f) => `family=${encodeURIComponent(f.trim())}:wght@300;400;500;600;700;800`,
          )
          .join('&')}&display=swap`
      : null;

  if (headingFamily) {
    // Single bare family — the template tokens chain in their own
    // template-specific fallback if the Google Font fails to load.
    (themeStyle as Record<string, string>)['--font-heading'] = `"${headingFamily}"`;
  }
  if (bodyFamily) {
    (themeStyle as Record<string, string>)['--font-body'] = `"${bodyFamily}"`;
  }

  return (
    <html
      lang={tenant?.locale ?? 'id-ID'}
      className={`${jakarta.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
      style={themeStyle}
      data-template={template}
    >
      {googleFontsHref && (
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={googleFontsHref} />
        </head>
      )}
      <body
        className="min-h-full flex flex-col bg-[var(--color-background)] text-[var(--color-dark)] font-sans"
        style={
          bodyFamily
            ? { fontFamily: `"${bodyFamily}", var(--font-sans), system-ui, sans-serif` }
            : undefined
        }
      >
        {tenant ? <TenantProvider tenant={toPublicTenant(tenant)}>{children}</TenantProvider> : children}
      </body>
    </html>
  );
}
