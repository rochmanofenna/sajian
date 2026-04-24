// GET /api/internal/codegen-metrics
//
// Ops endpoint behind HTTP Basic auth. Returns last-24h codegen
// counters grouped by tenant, plus compile latency percentiles and
// cache-hit rate. Read-only — never mutates state.
//
// Auth: Basic <base64(user:CODEGEN_METRICS_SECRET)>. The endpoint 404s
// when the secret isn't set, so misconfigured deployments don't leak
// the endpoint's existence.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EventRow {
  tenant_id: string;
  event_type: string;
  payload: { compile_ms?: number; cache_hit?: boolean } | null;
  created_at: string;
}

interface TenantAccum {
  attempts: number;
  sanitizer_rejects: number;
  compile_errors: number;
  retry_successes: number;
  double_failures: number;
  render_errors: number;
  compile_times_ms: number[];
  cache_attempts: number;
  cache_hits: number;
}

function emptyAccum(): TenantAccum {
  return {
    attempts: 0,
    sanitizer_rejects: 0,
    compile_errors: 0,
    retry_successes: 0,
    double_failures: 0,
    render_errors: 0,
    compile_times_ms: [],
    cache_attempts: 0,
    cache_hits: 0,
  };
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
  return sortedValues[rank];
}

function checkBasicAuth(req: Request): boolean {
  const secret = process.env.CODEGEN_METRICS_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('basic ')) return false;
  try {
    const raw = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = raw.indexOf(':');
    if (idx < 0) return false;
    // Constant-ish time compare on the secret half. The username is
    // intentionally unchecked — we only care about the shared secret.
    const supplied = raw.slice(idx + 1);
    if (supplied.length !== secret.length) return false;
    let diff = 0;
    for (let i = 0; i < secret.length; i++) {
      diff |= supplied.charCodeAt(i) ^ secret.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    if (!process.env.CODEGEN_METRICS_SECRET) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (!checkBasicAuth(req)) {
      return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="codegen-metrics"',
        },
      });
    }

    const service = createServiceClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await service
      .from('codegen_events')
      .select('tenant_id, event_type, payload, created_at')
      .gte('created_at', since)
      .limit(50_000);
    if (error) throw error;

    const byTenant = new Map<string, TenantAccum>();
    const retryByTenant = new Map<string, number>();

    for (const rowUnknown of (data ?? []) as EventRow[]) {
      const row = rowUnknown;
      if (!row.tenant_id) continue;
      if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, emptyAccum());
      const acc = byTenant.get(row.tenant_id)!;

      switch (row.event_type) {
        case 'codegen_attempt':
          acc.attempts += 1;
          break;
        case 'codegen_sanitizer_reject':
          acc.sanitizer_rejects += 1;
          break;
        case 'codegen_compile_error':
          acc.compile_errors += 1;
          break;
        case 'codegen_retry':
          retryByTenant.set(row.tenant_id, (retryByTenant.get(row.tenant_id) ?? 0) + 1);
          break;
        case 'codegen_double_failure':
          acc.double_failures += 1;
          break;
        case 'codegen_section_render_error':
          acc.render_errors += 1;
          break;
        case 'codegen_compile_success': {
          const ms = typeof row.payload?.compile_ms === 'number' ? row.payload.compile_ms : null;
          if (ms !== null) acc.compile_times_ms.push(ms);
          acc.cache_attempts += 1;
          if (row.payload?.cache_hit === true) acc.cache_hits += 1;
          // retry_successes = retries that landed with a success
          // afterward. Counting per-tenant via the retry ledger above.
          acc.retry_successes = Math.min(
            retryByTenant.get(row.tenant_id) ?? 0,
            acc.attempts,
          );
          break;
        }
      }
    }

    const tenants = Array.from(byTenant.entries()).map(([tenantId, acc]) => {
      const sorted = acc.compile_times_ms.slice().sort((a, b) => a - b);
      return {
        tenant_id: tenantId,
        attempts: acc.attempts,
        sanitizer_rejects: acc.sanitizer_rejects,
        compile_errors: acc.compile_errors,
        retry_successes: acc.retry_successes,
        double_failures: acc.double_failures,
        render_errors: acc.render_errors,
        p50_compile_ms: percentile(sorted, 50),
        p95_compile_ms: percentile(sorted, 95),
        cache_hit_rate:
          acc.cache_attempts === 0 ? 0 : Number((acc.cache_hits / acc.cache_attempts).toFixed(3)),
      };
    });

    return NextResponse.json({
      window: '24h',
      since,
      tenants: tenants.sort((a, b) => b.attempts - a.attempts),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
