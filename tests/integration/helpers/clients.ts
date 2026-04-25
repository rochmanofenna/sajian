// Supabase clients pointed at the test branch. Three flavors:
//
//   serviceClient() — bypasses RLS. Used for seed/reset + as the
//     "admin path" comparison in tenant-isolation tests.
//   anonClient()   — what the storefront uses. RLS enforces.
//   authedClient(jwt) — like anonClient but with an explicit
//     auth.uid() bound. Used to test "tenant A's owner cannot read
//     tenant B's rows" — the core Xendit-class prevention.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTestBranch } from './branch';

let _service: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

export async function serviceClient(): Promise<SupabaseClient> {
  if (_service) return _service;
  const b = getTestBranch();
  _service = createClient(b.apiUrl, b.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}

export async function anonClient(): Promise<SupabaseClient> {
  if (_anon) return _anon;
  const b = getTestBranch();
  _anon = createClient(b.apiUrl, b.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anon;
}

export async function authedClient(accessToken: string): Promise<SupabaseClient> {
  const b = getTestBranch();
  return createClient(b.apiUrl, b.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function __resetClientsCache(): void {
  _service = null;
  _anon = null;
}
