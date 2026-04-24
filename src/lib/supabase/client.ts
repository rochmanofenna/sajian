// Browser-side Supabase client. Use this from Client Components.
// Singleton — the SSR package memoizes the client per document.

import { createBrowserClient } from '@supabase/ssr';

function cookieOptions() {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
  // Leave domain unset on localhost — browsers reject a Domain attribute
  // for hostnames without a dot. On production we set it to `.sajian.app`
  // so the session cookie survives the apex → subdomain redirect after login.
  return domain ? { domain, path: '/', sameSite: 'lax' as const } : undefined;
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env vars');
  return createBrowserClient(url, anon, {
    cookieOptions: cookieOptions(),
  });
}
