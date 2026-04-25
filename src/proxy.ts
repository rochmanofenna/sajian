// Subdomain → tenant-slug routing + security headers. Reads the Host
// header, extracts the first label, and forwards it as `x-tenant-slug` so
// Server Components can resolve the tenant without each page re-parsing
// the host. Also refreshes the Supabase auth cookie, redirects owner-only
// surfaces off tenant subdomains, and stamps the response with a
// per-request CSP so the rest of the pipeline stays defense-in-depth.
//
// The matcher now runs on /api/* too so the tenant-subdomain redirect
// rule catches /api/ai, /api/sections, /api/onboarding, /api/admin.
// Customer-path API routes (/api/order, /api/menu, /api/branches,
// /api/tenant, /api/webhooks) still pass through the proxy — they're
// not in the OWNER_PATH_PREFIXES list and never redirect.

import { NextRequest, NextResponse } from 'next/server';
import { slugFromHost } from '@/lib/tenant';
import { updateSession } from '@/lib/supabase/middleware';
import { buildCsp, cspHeaderName } from '@/lib/security/csp';

// Paths that should never be served from a tenant subdomain. Owner
// surfaces live on the app origin so a single auth session / cookie
// scope covers everything. If the owner lands on their tenant
// subdomain while trying to reach one of these, we 302 them to the
// app origin preserving the same path + query.
const OWNER_PATH_PREFIXES = [
  '/setup',
  '/admin',
  '/signup',
  '/login',
  '/api/ai/',
  '/api/sections/',
  '/api/onboarding/',
  '/api/admin/',
];

function isOwnerOnlyPath(pathname: string): boolean {
  return OWNER_PATH_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}

function appOrigin(host: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const cleanHost = host.split(':')[0].toLowerCase();
  // Localhost dev: keep the same origin so `npm run dev` works without
  // DNS + multiple hostnames. Prod defaults to the apex sajian.app when
  // NEXT_PUBLIC_APP_ORIGIN isn't configured.
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
    const port = host.includes(':') ? `:${host.split(':')[1]}` : '';
    return `http://localhost${port}`;
  }
  return 'https://sajian.app';
}

// Tenant classification for CSP. Preview origin wins over slug
// resolution; tenant subdomains vs apex / www / app-subdomain resolve
// via the parser.
function cspContext(slug: string | null, host: string): 'app' | 'storefront' | 'preview' {
  const cleanHost = host.split(':')[0].toLowerCase();
  if (cleanHost === 'preview.sajian.app') return 'preview';
  if (slug === 'preview') return 'preview';
  if (slug) return 'storefront';
  if (cleanHost === 'sajian.app' || cleanHost === 'www.sajian.app') return 'app';
  if (cleanHost === 'app.sajian.app') return 'app';
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') return 'app';
  if (cleanHost.endsWith('.vercel.app')) return 'app';
  return 'app';
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const slug = slugFromHost(host);
  const pathname = request.nextUrl.pathname;

  // Owner-only paths on a tenant subdomain redirect to the app origin
  // with the original path + query string preserved. Preview origin is
  // exempt (its /preview/[userId] route is the only thing it serves).
  if (slug && slug !== 'preview' && isOwnerOnlyPath(pathname)) {
    const target = new URL(
      pathname + request.nextUrl.search,
      appOrigin(host),
    );
    return NextResponse.redirect(target, { status: 302 });
  }

  // Per-request nonce for `script-src 'nonce-...' 'strict-dynamic'`.
  // Browsers require the nonce on the HTTP header to match the <script>
  // attribute, so it has to be stable across the single response.
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const context = cspContext(slug, host);
  const previewFrameOrigin =
    process.env.NEXT_PUBLIC_PREVIEW_ORIGIN ??
    (host.includes('localhost') ? `http://${host}` : 'https://preview.sajian.app');
  const appFrameOrigin = appOrigin(host);

  // Storefront proxy-mode preview: the iframe URL carries
  // ?preview_token=... OR the cookie has been promoted on a previous
  // page load. We can't verify the JWT here (edge runtime, no node
  // crypto), so we trust mere presence to relax framing — the page
  // server still validates the token before rendering draft state, so
  // a forged token only reveals the live page, which is what
  // frame-ancestors 'none' was preventing anyway. Either signal is
  // enough; both are common during normal navigation.
  const storefrontPreviewMode =
    context === 'storefront' &&
    (Boolean(request.nextUrl.searchParams.get('preview_token')) ||
      request.cookies.has('sajian_preview_token'));

  const csp = buildCsp({
    context,
    nonce,
    previewFrameOrigin,
    appFrameOrigin,
    storefrontPreviewMode,
  });
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
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');

  // Promote ?preview_token= into a cookie so subsequent in-iframe
  // navigation (clicks to /menu, /cart, /checkout) keeps preview mode
  // without the parent rewriting every link. We CAN'T do this from
  // the page server component — Next.js disallows cookie mutation
  // outside route handlers / server actions / middleware. The token
  // is set as-is; the page server still verifies it via
  // verifyPreviewToken() before rendering draft state, so a forged
  // value just yields the live page (which is what we'd render
  // anyway).
  if (context === 'storefront') {
    const incoming = request.nextUrl.searchParams.get('preview_token');
    if (incoming) {
      response.cookies.set('sajian_preview_token', incoming, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !host.includes('localhost'),
        path: '/',
        maxAge: 15 * 60,
      });
    }
  }
  // X-Frame-Options doesn't support allow-from, so we can't express
  // "frame by sajian.app only" here — CSP frame-ancestors does that
  // precisely. We OMIT XFO on the preview origin AND on the storefront
  // when it's serving in preview mode (proxy-mode iframe), letting the
  // more precise frame-ancestors directive govern. Otherwise we keep
  // the strict defaults.
  if (context === 'storefront' && !storefrontPreviewMode) {
    response.headers.set('X-Frame-Options', 'DENY');
  } else if (context === 'app') {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }

  // Drafts must never be indexed.
  if (storefrontPreviewMode) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()',
  );

  return response;
}

export const config = {
  matcher: [
    // Runs on app paths + the owner-only API prefixes listed above.
    // Customer-path API routes (/api/order, /api/menu, /api/branches,
    // /api/tenant, /api/webhooks) are excluded — they need to work on
    // tenant subdomains without the redirect kicking in.
    '/((?!_next/static|_next/image|favicon.ico|api/(?:order|menu|branches|tenant|webhooks|csp-report)(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)',
  ],
};
