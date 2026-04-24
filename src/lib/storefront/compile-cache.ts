// Two-tier compile cache.
//
//   L1 — process-memory LRU (500 entries, 15 min TTL). Survives warm
//        invocations on the same serverless container.
//   L2 — storefront_compile_cache in Supabase. Survives cold starts and
//        is shared across every instance.
//
// The compile API writes through L1→L2 on a fresh compile, and reads
// L1→L2 on a lookup. L2 misses promote to L1 for the rest of the
// container's life so subsequent renders on the same instance skip the
// network call.

import { createServiceClient } from '@/lib/supabase/service';

interface Entry {
  value: string;
  expires_at: number;
}

const L1_MAX = 500;
const L1_TTL_MS = 15 * 60 * 1000;

const L1 = new Map<string, Entry>();

function l1Prune(): void {
  const now = Date.now();
  for (const [k, v] of L1) {
    if (v.expires_at < now) L1.delete(k);
  }
  while (L1.size > L1_MAX) {
    // Oldest first — Map preserves insertion order, which for our TTL
    // pattern approximates LRU closely enough.
    const oldest = L1.keys().next().value;
    if (!oldest) break;
    L1.delete(oldest);
  }
}

function l1Get(key: string): string | null {
  const hit = L1.get(key);
  if (!hit) return null;
  if (hit.expires_at < Date.now()) {
    L1.delete(key);
    return null;
  }
  // Refresh position so re-used entries survive pruning.
  L1.delete(key);
  L1.set(key, hit);
  return hit.value;
}

function l1Set(key: string, value: string): void {
  L1.set(key, { value, expires_at: Date.now() + L1_TTL_MS });
  if (L1.size > L1_MAX) l1Prune();
}

export async function cacheGet(code_hash: string): Promise<string | null> {
  const l1Hit = l1Get(code_hash);
  if (l1Hit) {
    console.log('[compile-cache] L1 hit', { code_hash: code_hash.slice(0, 12) });
    return l1Hit;
  }
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('storefront_compile_cache')
      .select('compiled_code')
      .eq('code_hash', code_hash)
      .maybeSingle();
    if (error || !data) {
      if (error) console.warn('[compile-cache] L2 read failed', error.message);
      return null;
    }
    console.log('[compile-cache] L2 hit', { code_hash: code_hash.slice(0, 12) });
    l1Set(code_hash, data.compiled_code as string);
    // Fire-and-forget touch so the weekly eviction job leaves hot
    // entries alone.
    void sb
      .from('storefront_compile_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('code_hash', code_hash);
    return data.compiled_code as string;
  } catch (err) {
    console.warn('[compile-cache] L2 unavailable', err);
    return null;
  }
}

export async function cacheSet(code_hash: string, compiled_code: string): Promise<void> {
  l1Set(code_hash, compiled_code);
  try {
    const sb = createServiceClient();
    const { error } = await sb
      .from('storefront_compile_cache')
      .upsert(
        { code_hash, compiled_code, last_used_at: new Date().toISOString() },
        { onConflict: 'code_hash' },
      );
    if (error) console.warn('[compile-cache] L2 write failed', error.message);
  } catch (err) {
    console.warn('[compile-cache] L2 unavailable for write', err);
  }
}

// Exposed for tests.
export function _l1Size(): number {
  return L1.size;
}

export function _l1Clear(): void {
  L1.clear();
}
