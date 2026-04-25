// Platform-wide feature flags. Single key/value table read on hot
// paths (every order submit + every CheckoutView render). 60-second
// in-memory cache keeps reads ~free; writes go through the operator
// /api/admin/platform-flags route which invalidates the cache.
//
// Fail-closed semantics for safety-critical flags: when the DB is
// unreachable, digital_payments_enabled returns false. Allowing the
// digital flow under DB error would re-introduce the exact bug this
// gate prevents.

import { createServiceClient } from '@/lib/supabase/service';

const TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

let cache: CacheEntry<Record<string, unknown>> | null = null;

async function loadAll(): Promise<Record<string, unknown>> {
  if (cache && cache.expires > Date.now()) return cache.value;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.from('platform_flags').select('key, value');
    if (error) throw error;
    const map: Record<string, unknown> = {};
    for (const row of data ?? []) map[row.key as string] = row.value;
    cache = { value: map, expires: Date.now() + TTL_MS };
    return map;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[platform-flags] load failed', err);
    return {};
  }
}

export async function isDigitalPaymentsEnabled(): Promise<boolean> {
  const map = await loadAll();
  // Fail-closed — only `true` (booleans, never strings) flips the gate.
  return map.digital_payments_enabled === true;
}

export async function setPlatformFlag(
  key: string,
  value: unknown,
  by: string,
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from('platform_flags')
    .upsert(
      { key, value, updated_by: by, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) throw error;
  cache = null;
}

export function __invalidatePlatformFlagsCache(): void {
  cache = null;
}
