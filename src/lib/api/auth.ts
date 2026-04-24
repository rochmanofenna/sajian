// Server-side auth helpers for API routes. Thin wrappers around the Supabase
// server client that surface a stable identity string so rate limiters and
// audit logs don't have to re-check whether the user is signed in.

import { createClient as createServerClient } from '@/lib/supabase/server';

export interface ApiUser {
  id: string;
  email: string | null;
  phone: string | null;
}

// Returns the authenticated user or null. Never throws — suitable for rate
// limiter lookups that tolerate anon callers and fall back to IP keys.
export async function getUser(): Promise<ApiUser | null> {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
  };
}

// Best-effort client IP for rate limiting when the user isn't authenticated.
// Vercel sets `x-forwarded-for`; fall back to an inert sentinel so the rate
// limiter still buckets anon traffic consistently per instance.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri;
  return 'unknown';
}

// Composite identity: prefer user id, fall back to IP. Shape it so buckets
// for authed and anon callers can't collide.
export async function identityKey(req: Request): Promise<string> {
  const user = await getUser();
  if (user) return `u:${user.id}`;
  return `ip:${clientIp(req)}`;
}
