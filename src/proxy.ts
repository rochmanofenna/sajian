// Subdomain → tenant-slug routing + security headers. Reads the Host
// header, extracts the first label, and forwards it as `x-tenant-slug` so
// Server Components can resolve the tenant without each page re-parsing
// the host. Also refreshes the Supabase auth cookie and stamps the
// response with a per-request CSP (nonce + directives) so the rest of
// the pipeline stays defense-in-depth by default.
//
// The matcher excludes /api/* to keep API routes simple (they resolve the
// tenant via Host header fallback in `getTenant()`). Also excludes Next
// internal paths and static assets so we don't pay the proxy cost there.
//
// Renamed from middleware.ts → proxy.ts for Next.js 16 (old name is deprecated).

import { NextRequest } from 'next/server';
import { slugFromHost } from '@/lib/tenant';
import { updateSession } from '@/lib/supabase/middleware';
import { buildCsp, cspHeaderName } from '@/lib/security/csp';

// The onboarding app (sajian.app apex, app.sajian.app when we move, and
// localhost for dev) hosts the /setup iframe and therefore needs to be
// framed by preview.sajian.app. Tenant subdomains are CSP-locked to
// frame-ancestors 'none' — nobody should be able to embed a customer
// storefront in a phishing frame.
function cspContext(slug: string | null, host: string): 'app' | 'storefront' | 'preview' {
  // Preview origin wins over slug resolution — the slug parser returns
  // 'preview' for preview.sajian.app, but we need distinct CSP rules
  // so flag it explicitly here.
  const cleanHost = host.split(':')[0].toLowerCase();
  if (cleanHost === 'preview.sajian.app') return 'preview';
  if (slug === 'preview') return 'preview';
  if (slug) return 'storefront';
  if (cleanHost === 'sajian.app' || cleanHost === 'www.sajian.app') return 'app';
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') return 'app';
  if (cleanHost.endsWith('.vercel.app')) return 'app';
  return 'app';
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const slug = slugFromHost(host);

  // Per-request nonce for `script-src 'nonce-...' 'strict-dynamic'`.
  // Browsers require the nonce on the HTTP header to match the <script>
  // attribute, so it has to be stable across the single response.
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const context = cspContext(slug, host);
  const previewFrameOrigin =
    process.env.NEXT_PUBLIC_PREVIEW_ORIGIN ??
    (host.includes('localhost') ? `http://${host}` : 'https://preview.sajian.app');

  const csp = buildCsp({ context, nonce, previewFrameOrigin });
  const cspHeader = cspHeaderName();

  // Thread nonce + CSP onto the REQUEST so Next's internal bootstrap
  // scripts stamp the nonce onto their own injected <script> tags.
  // Without this the framework's own hydration script gets blocked.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = await updateSession(
    new NextRequest(request, { headers: requestHeaders }),
  );

  if (slug) response.headers.set('x-tenant-slug', slug);
  response.headers.set('x-nonce', nonce);
  response.headers.set(cspHeader, csp);
  // Defense-in-depth headers that don't need per-request values.
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('X-Frame-Options', context === 'storefront' ? 'DENY' : 'SAMEORIGIN');
  // Storefronts don't need mic/camera/geolocation for anything today.
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()',
  );

  return response;
}

export const config = {
  matcher: [
    // Skip: _next/static, _next/image, favicon, assets, api routes
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)',
  ],
};
