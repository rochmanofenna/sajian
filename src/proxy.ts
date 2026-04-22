// Subdomain → tenant-slug routing. Reads the Host header, extracts the first
// label, and forwards it as `x-tenant-slug` so Server Components can resolve
// the tenant without each page re-parsing the host.
//
// The matcher excludes /api/* to keep API routes simple (they resolve the
// tenant via Host header fallback in `getTenant()`). Also excludes Next
// internal paths and static assets so we don't pay the proxy cost there.
//
// Also refreshes the Supabase auth session so cookies don't go stale.
//
// Renamed from middleware.ts → proxy.ts for Next.js 16 (old name is deprecated).

import type { NextRequest } from 'next/server';
import { slugFromHost } from '@/lib/tenant';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host');
  const slug = slugFromHost(host);

  const response = await updateSession(request);

  if (slug) {
    response.headers.set('x-tenant-slug', slug);
  }
  return response;
}

export const config = {
  matcher: [
    // Skip: _next/static, _next/image, favicon, assets, api routes
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)',
  ],
};
