// Codegen circuit breaker.
//
// Runs on every compile request BEFORE we touch esbuild. The fast path
// is cached to sub-millisecond so a healthy breaker never slows the hot
// loop. When a threshold trips we:
//
//   1. Write a row to public.codegen_circuit_trips (audit trail).
//   2. For per-tenant trips: flip public.feature_flags.codegen_enabled
//      to false via disableCodegen(). Manual re-enable only — this
//      module never auto-recovers.
//   3. For the global trip: flip public.codegen_global_state off so
//      every tenant stops receiving codegen the next cache cycle.
//
// Thresholds (sliding 1-hour window unless noted):
//   • per-tenant:
//       > 5 double_failures          → trip
//       > 10 render_errors           → trip
//       p95 compile_ms > 5000        → trip (requires ≥ 50 samples)
//   • global (sliding 1-minute window):
//       > 50 compile_errors/minute   → trip global
//
// The hot-path check is cache-only — the breaker state lives on the
// feature_flags / codegen_global_state tables the compile route is
// already reading. This file exists so the slower thresholds-evaluation
// job can be invoked asynchronously from the same call site without
// blocking the owner's request.

import { createServiceClient } from '@/lib/supabase/service';
import { disableCodegen, setGlobalKillSwitch } from '@/lib/feature-flags';

interface EventRow {
  tenant_id: string;
  event_type: string;
  payload: { compile_ms?: number } | null;
  created_at: string;
}

export const BREAKER_THRESHOLDS = {
  perTenantDoubleFailures: 5,
  perTenantRenderErrors: 10,
  perTenantP95CompileMs: 5_000,
  perTenantP95MinSamples: 50,
  globalCompileErrorsPerMinute: 50,
  perTenantWindowMs: 60 * 60 * 1000,
  globalWindowMs: 60 * 1000,
} as const;

// Rate-limit the actual DB evaluation to once per tenant every 30s. A
// single owner hammering compile doesn't need N evaluations — the
// thresholds are window-based, so sub-minute polling adds zero signal.
const lastEvalPerTenant = new Map<string, number>();
const EVAL_THROTTLE_MS = 30_000;
let lastGlobalEval = 0;

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
  return sortedValues[rank];
}

async function openTrip(
  tenantId: string | null,
  reason: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  try {
    const service = createServiceClient();
    // Don't pile up duplicates: if there's already an open trip for
    // the same tenant + reason, just update its snapshot instead of
    // inserting a second row.
    const { data: existing } = await service
      .from('codegen_circuit_trips')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('reason', reason)
      .is('reset_at', null)
      .maybeSingle();
    if (existing?.id) {
      await service
        .from('codegen_circuit_trips')
        .update({ metric_snapshot: snapshot })
        .eq('id', existing.id);
      return;
    }
    await service.from('codegen_circuit_trips').insert({
      tenant_id: tenantId,
      reason,
      metric_snapshot: snapshot,
    });
  } catch (err) {
    // We've already committed to disabling the flag; missing the audit
    // row is a visibility miss, not a correctness miss.
    // eslint-disable-next-line no-console
    console.error('[codegen-breaker] openTrip failed', err);
  }
}

interface TenantEvaluationResult {
  tripped: boolean;
  reason?: 'double_failures' | 'render_errors' | 'p95_compile_ms_high';
  snapshot?: Record<string, unknown>;
}

async function evaluateTenant(tenantId: string): Promise<TenantEvaluationResult> {
  const service = createServiceClient();
  const since = new Date(Date.now() - BREAKER_THRESHOLDS.perTenantWindowMs).toISOString();
  const { data, error } = await service
    .from('codegen_events')
    .select('tenant_id, event_type, payload, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .limit(5_000);
  if (error || !data) return { tripped: false };

  const rows = data as EventRow[];
  let doubleFailures = 0;
  let renderErrors = 0;
  const compileTimes: number[] = [];
  for (const row of rows) {
    switch (row.event_type) {
      case 'codegen_double_failure':
        doubleFailures += 1;
        break;
      case 'codegen_section_render_error':
        renderErrors += 1;
        break;
      case 'codegen_compile_success': {
        const ms = typeof row.payload?.compile_ms === 'number' ? row.payload.compile_ms : null;
        if (ms !== null) compileTimes.push(ms);
        break;
      }
    }
  }

  const snapshot = {
    double_failures: doubleFailures,
    render_errors: renderErrors,
    compile_samples: compileTimes.length,
    p95_compile_ms: 0,
  };

  if (doubleFailures > BREAKER_THRESHOLDS.perTenantDoubleFailures) {
    return { tripped: true, reason: 'double_failures', snapshot };
  }
  if (renderErrors > BREAKER_THRESHOLDS.perTenantRenderErrors) {
    return { tripped: true, reason: 'render_errors', snapshot };
  }
  if (compileTimes.length >= BREAKER_THRESHOLDS.perTenantP95MinSamples) {
    const sorted = compileTimes.slice().sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    snapshot.p95_compile_ms = p95;
    if (p95 > BREAKER_THRESHOLDS.perTenantP95CompileMs) {
      return { tripped: true, reason: 'p95_compile_ms_high', snapshot };
    }
  }

  return { tripped: false };
}

async function evaluateGlobal(): Promise<{ tripped: boolean; snapshot?: Record<string, unknown> }> {
  const service = createServiceClient();
  const since = new Date(Date.now() - BREAKER_THRESHOLDS.globalWindowMs).toISOString();
  const { count } = await service
    .from('codegen_events')
    .select('id', { head: true, count: 'exact' })
    .eq('event_type', 'codegen_compile_error')
    .gte('created_at', since);
  if ((count ?? 0) > BREAKER_THRESHOLDS.globalCompileErrorsPerMinute) {
    return { tripped: true, snapshot: { compile_errors_last_minute: count } };
  }
  return { tripped: false };
}

// Public hot path. Returns void — the breaker's side effects flow
// through the flag tables the next cached read will pick up. Safe to
// await, but designed to also be fired-and-forgotten from the compile
// route so we don't block on the evaluation query.
export async function runBreakerChecks(tenantId: string): Promise<void> {
  const now = Date.now();
  const lastPerTenant = lastEvalPerTenant.get(tenantId) ?? 0;
  const perTenantDue = now - lastPerTenant > EVAL_THROTTLE_MS;
  const globalDue = now - lastGlobalEval > EVAL_THROTTLE_MS;
  if (!perTenantDue && !globalDue) return;

  if (perTenantDue) {
    lastEvalPerTenant.set(tenantId, now);
    const result = await evaluateTenant(tenantId);
    if (result.tripped && result.reason) {
      await disableCodegen(tenantId, `circuit:${result.reason}`);
      await openTrip(tenantId, result.reason, result.snapshot ?? {});
    }
  }

  if (globalDue) {
    lastGlobalEval = now;
    const result = await evaluateGlobal();
    if (result.tripped) {
      await setGlobalKillSwitch({
        enabled: false,
        reason: 'compile_error_storm',
        by: 'circuit_breaker',
      });
      await openTrip(null, 'global_compile_error_storm', result.snapshot ?? {});
    }
  }
}

// Test hook — wipes the in-process evaluation throttles.
export function __resetBreakerThrottles(): void {
  lastEvalPerTenant.clear();
  lastGlobalEval = 0;
}
