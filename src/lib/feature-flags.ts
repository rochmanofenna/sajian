// Feature flags for codegen gating + global kill switch.
//
// Two layers:
//
//   1. Global kill switch. Env `CODEGEN_GLOBALLY_ENABLED=false` or a row
//      in public.codegen_global_state.codegen_globally_enabled=false
//      disables codegen for every tenant. The env is a coarse operator
//      knob; the DB row is what the circuit breaker flips.
//   2. Per-tenant flag. public.feature_flags.codegen_enabled must be
//      true for a launched tenant to receive codegen capabilities.
//      Pre-launch drafts (no tenant row yet) inherit the global state
//      only — they'll only produce custom sections once the tenant
//      opts in after launch.
//
// Every read is cached 60s in a per-process LRU to keep the hot path
// (compile + chat) under 1ms on warm paths. Writes invalidate local
// keys but NOT other instances — correctness tolerates a 60s lag for
// enable; for disable we accept the same. The circuit breaker lives on
// the same tick so the worst case is 60s of continued damage before
// auto-disable propagates, bounded by the next read.

import { createServiceClient } from '@/lib/supabase/service';

type CacheEntry<T> = { value: T; expires: number };

const CACHE_TTL_MS = 60_000;
const tenantCache = new Map<string, CacheEntry<boolean>>();
let globalCache: CacheEntry<boolean> | null = null;

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cachePut<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
  map.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  // Keep the LRU bounded; we only ever carry a handful of tenants per
  // process worker so 256 is generous without being wasteful.
  if (map.size > 256) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

function envGlobalAllowed(): boolean {
  // Default is ON per the spec — codegen is only disabled when someone
  // explicitly sets CODEGEN_GLOBALLY_ENABLED=false in Vercel env.
  const v = (process.env.CODEGEN_GLOBALLY_ENABLED ?? 'true').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export async function isGlobalCodegenEnabled(): Promise<boolean> {
  if (!envGlobalAllowed()) return false;
  const cached = globalCache;
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from('codegen_global_state')
      .select('codegen_globally_enabled')
      .eq('id', 1)
      .maybeSingle();
    // Missing row = default-on (fresh DB / migration just ran).
    const allowed = data ? Boolean(data.codegen_globally_enabled) : true;
    globalCache = { value: allowed, expires: Date.now() + CACHE_TTL_MS };
    return allowed;
  } catch {
    // DB hiccup: fail-open against the env flag so a bad infra moment
    // doesn't silently strip codegen from every tenant's AI.
    return envGlobalAllowed();
  }
}

export async function isCodegenEnabled(tenantId: string | null | undefined): Promise<boolean> {
  if (!(await isGlobalCodegenEnabled())) return false;
  if (!tenantId) return false; // Pre-launch drafts don't get codegen.
  const cached = cacheGet(tenantCache, tenantId);
  if (cached !== undefined) return cached;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from('feature_flags')
      .select('codegen_enabled')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const enabled = Boolean(data?.codegen_enabled);
    cachePut(tenantCache, tenantId, enabled);
    return enabled;
  } catch {
    // On DB error, fail-closed for per-tenant reads. An unflagged
    // tenant getting codegen would be more surprising than one
    // temporarily missing it.
    return false;
  }
}

export type CodegenEnableSource = 'admin' | 'self_opt_in' | 'canary_auto';

export async function enableCodegen(tenantId: string, by: CodegenEnableSource): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from('feature_flags')
    .upsert(
      {
        tenant_id: tenantId,
        codegen_enabled: true,
        codegen_enabled_at: new Date().toISOString(),
        codegen_enabled_by: by,
      },
      { onConflict: 'tenant_id' },
    );
  if (error) throw error;
  tenantCache.delete(tenantId);
}

export async function disableCodegen(tenantId: string, reason: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from('feature_flags')
    .upsert(
      {
        tenant_id: tenantId,
        codegen_enabled: false,
        codegen_enabled_at: null,
        codegen_enabled_by: `disabled:${reason.slice(0, 80)}`,
      },
      { onConflict: 'tenant_id' },
    );
  if (error) throw error;
  tenantCache.delete(tenantId);
}

export async function setGlobalKillSwitch(opts: {
  enabled: boolean;
  reason: string;
  by: string;
}): Promise<void> {
  const service = createServiceClient();
  const patch: Record<string, unknown> = {
    id: 1,
    codegen_globally_enabled: opts.enabled,
  };
  if (!opts.enabled) {
    patch.disabled_reason = opts.reason;
    patch.disabled_at = new Date().toISOString();
    patch.disabled_by = opts.by;
  } else {
    patch.disabled_reason = null;
    patch.disabled_at = null;
    patch.disabled_by = null;
  }
  const { error } = await service.from('codegen_global_state').upsert(patch, { onConflict: 'id' });
  if (error) throw error;
  globalCache = null;
}

// Test / ops hook — wipes the in-process caches. Not exported from a
// barrel; call sites import directly.
export function __invalidateFeatureFlagCache(): void {
  tenantCache.clear();
  globalCache = null;
}
