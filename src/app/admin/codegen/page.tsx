// /admin/codegen — Sajian operator dashboard for the codegen pipeline.
// Shows global kill-switch state, per-tenant flags + 24h activity, the
// circuit-breaker history, and the most recent events. No charts —
// this is an ops surface, not a marketing dashboard.
//
// Gated by admin_users table via getAdminOperatorOrNull; non-admins
// see a plain 404-ish page so the surface doesn't leak.

import Link from 'next/link';
import { getAdminOperatorOrNull } from '@/lib/admin/is-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { CodegenOpsClient } from '@/components/admin/CodegenOpsClient';
import { isDigitalPaymentsEnabled } from '@/lib/platform-flags';

interface TenantSummary {
  tenant_id: string;
  slug: string;
  name: string;
  codegen_enabled: boolean;
  codegen_enabled_by: string | null;
  codegen_enabled_at: string | null;
  attempts: number;
  compile_errors: number;
  double_failures: number;
  render_errors: number;
  breaker_open: boolean;
  open_trip_id: string | null;
}

interface EventRow {
  id: string;
  tenant_id: string | null;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
}

interface TripRow {
  id: string;
  tenant_id: string | null;
  reason: string;
  metric_snapshot: Record<string, unknown> | null;
  tripped_at: string;
  reset_at: string | null;
  reset_by: string | null;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CodegenOpsPage() {
  const operator = await getAdminOperatorOrNull();
  if (!operator) {
    return (
      <div className="flex items-center justify-center py-24 px-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold">Tidak tersedia</h1>
          <p className="text-sm text-zinc-600">
            Halaman ini hanya untuk operator Sajian. Jika kamu owner toko,{' '}
            <Link href="/admin" className="underline">
              buka dashboard admin toko
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const service = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [tenantsRes, flagsRes, eventsRes, tripsRes, globalRes, digitalPaymentsEnabled] =
    await Promise.all([
      service.from('tenants').select('id, slug, name').order('name'),
      service.from('feature_flags').select('tenant_id, codegen_enabled, codegen_enabled_at, codegen_enabled_by'),
      service
        .from('codegen_events')
        .select('id, tenant_id, event_type, created_at, payload')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100),
      service
        .from('codegen_circuit_trips')
        .select('id, tenant_id, reason, metric_snapshot, tripped_at, reset_at, reset_by')
        .order('tripped_at', { ascending: false })
        .limit(50),
      service
        .from('codegen_global_state')
        .select('codegen_globally_enabled, disabled_reason, disabled_at, disabled_by')
        .eq('id', 1)
        .maybeSingle(),
      isDigitalPaymentsEnabled(),
    ]);

  const tenantsList = (tenantsRes.data ?? []) as Array<{ id: string; slug: string; name: string }>;
  const flagsByTenant = new Map<string, { codegen_enabled: boolean; codegen_enabled_by: string | null; codegen_enabled_at: string | null }>();
  for (const f of (flagsRes.data ?? []) as Array<{
    tenant_id: string;
    codegen_enabled: boolean;
    codegen_enabled_at: string | null;
    codegen_enabled_by: string | null;
  }>) {
    flagsByTenant.set(f.tenant_id, {
      codegen_enabled: f.codegen_enabled,
      codegen_enabled_by: f.codegen_enabled_by,
      codegen_enabled_at: f.codegen_enabled_at,
    });
  }

  const events = (eventsRes.data ?? []) as EventRow[];
  const counters = new Map<string, { attempts: number; compile_errors: number; double_failures: number; render_errors: number }>();
  for (const ev of events) {
    if (!ev.tenant_id) continue;
    if (!counters.has(ev.tenant_id))
      counters.set(ev.tenant_id, { attempts: 0, compile_errors: 0, double_failures: 0, render_errors: 0 });
    const c = counters.get(ev.tenant_id)!;
    if (ev.event_type === 'codegen_attempt') c.attempts += 1;
    else if (ev.event_type === 'codegen_compile_error') c.compile_errors += 1;
    else if (ev.event_type === 'codegen_double_failure') c.double_failures += 1;
    else if (ev.event_type === 'codegen_section_render_error') c.render_errors += 1;
  }

  const trips = (tripsRes.data ?? []) as TripRow[];
  const openTripByTenant = new Map<string, string>();
  for (const trip of trips) {
    if (!trip.reset_at && trip.tenant_id) {
      if (!openTripByTenant.has(trip.tenant_id)) openTripByTenant.set(trip.tenant_id, trip.id);
    }
  }

  const summaries: TenantSummary[] = tenantsList.map((t) => {
    const flag = flagsByTenant.get(t.id);
    const c = counters.get(t.id) ?? { attempts: 0, compile_errors: 0, double_failures: 0, render_errors: 0 };
    return {
      tenant_id: t.id,
      slug: t.slug,
      name: t.name,
      codegen_enabled: flag?.codegen_enabled ?? false,
      codegen_enabled_by: flag?.codegen_enabled_by ?? null,
      codegen_enabled_at: flag?.codegen_enabled_at ?? null,
      attempts: c.attempts,
      compile_errors: c.compile_errors,
      double_failures: c.double_failures,
      render_errors: c.render_errors,
      breaker_open: openTripByTenant.has(t.id),
      open_trip_id: openTripByTenant.get(t.id) ?? null,
    };
  });

  summaries.sort((a, b) => {
    if (a.breaker_open !== b.breaker_open) return a.breaker_open ? -1 : 1;
    if (a.codegen_enabled !== b.codegen_enabled) return a.codegen_enabled ? -1 : 1;
    return (b.double_failures + b.render_errors) - (a.double_failures + a.render_errors);
  });

  const globalState = (globalRes.data ?? null) as {
    codegen_globally_enabled: boolean;
    disabled_reason: string | null;
    disabled_at: string | null;
    disabled_by: string | null;
  } | null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Codegen ops</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Operator: {operator.email ?? operator.userId}. Window: last 24h.
        </p>
      </header>

      <CodegenOpsClient
        globalState={globalState}
        tenants={summaries}
        events={events}
        trips={trips}
        digitalPaymentsEnabled={digitalPaymentsEnabled}
      />
    </div>
  );
}
