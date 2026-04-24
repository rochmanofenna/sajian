// Server Component / Route Handler Supabase client.
// Reads/writes cookies via Next's `cookies()` helper.
// Anon key only — use `service.ts` for privileged reads that bypass RLS.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env vars');

  const cookieStore = await cookies();
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

  return createServerClient(url, anon, {
    cookieOptions: domain ? { domain, path: '/', sameSite: 'lax' } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const merged = domain ? { ...options, domain } : options;
            cookieStore.set(name, value, merged);
          });
        } catch {
          // Called from a Server Component — `cookies()` is read-only there.
          // Middleware already refreshed the session, so this is safe to ignore.
        }
      },
    },
  });
}
