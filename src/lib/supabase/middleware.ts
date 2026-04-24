// Middleware Supabase client — refreshes the auth session on every request.
// Returns the response object so we can chain cookie writes on top.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

  const supabase = createServerClient(url, anon, {
    cookieOptions: domain ? { domain, path: '/', sameSite: 'lax' } : undefined,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          const merged = domain ? { ...options, domain } : options;
          response.cookies.set(name, value, merged);
        });
      },
    },
  });

  // Touch the session so refresh tokens roll forward. Swallow errors so a
  // transient Supabase outage doesn't 500 every request — the downstream
  // handler can still run (it will just see no session).
  try {
    await supabase.auth.getUser();
  } catch (err) {
    console.warn('[middleware] supabase.auth.getUser failed:', err);
  }

  return response;
}
