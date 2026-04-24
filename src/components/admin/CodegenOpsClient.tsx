'use client';

// Client shell for /admin/codegen. Server page fetches state; this
// component handles the interactive bits: flipping per-tenant flags,
// flipping the global kill switch, and resetting circuit breakers.
// Every mutation hits /api/admin/codegen which re-checks admin_users
// server-side, so this UI is not the security boundary.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

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

interface GlobalState {
  codegen_globally_enabled: boolean;
  disabled_reason: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
}

export function CodegenOpsClient({
  globalState,
  tenants,
  events,
  trips,
}: {
  globalState: GlobalState | null;
  tenants: TenantSummary[];
  events: EventRow[];
  trips: TripRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function call(op: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(op);
    try {
      const res = await fetch('/api/admin/codegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, ...body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'operation failed');
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const globallyEnabled = globalState?.codegen_globally_enabled ?? true;

  const failing = tenants
    .slice()
    .sort((a, b) => (b.double_failures + b.render_errors) - (a.double_failures + a.render_errors))
    .slice(0, 5)
    .filter((t) => t.double_failures + t.render_errors > 0);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Global kill switch</h2>
            <p className="text-sm text-zinc-500 mt-1">
              {globallyEnabled
                ? 'Codegen is currently enabled globally. Tenants with feature_flags.codegen_enabled get custom sections.'
                : `Globally disabled — codegen refused for ALL tenants.${
                    globalState?.disabled_reason ? ` Reason: ${globalState.disabled_reason}.` : ''
                  }${globalState?.disabled_by ? ` By: ${globalState.disabled_by}.` : ''}`}
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              onClick={() =>
                call('set_global', {
                  enabled: !globallyEnabled,
                  reason: globallyEnabled ? window.prompt('Reason (required to disable)?') ?? '' : '',
                })
              }
              disabled={busy === 'set_global' || pending}
              className={`h-10 px-4 rounded-full text-sm font-medium text-white disabled:opacity-60 ${
                globallyEnabled ? 'bg-red-600' : 'bg-emerald-600'
              }`}
            >
              {busy === 'set_global' ? 'Working…' : globallyEnabled ? 'Disable globally' : 'Re-enable globally'}
            </button>
          </div>
        </div>
      </section>

      {failing.length > 0 && (
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold mb-3">Top failing tenants (24h)</h2>
          <ul className="text-sm space-y-1">
            {failing.map((t) => (
              <li key={t.tenant_id} className="flex items-center justify-between">
                <span>{t.name}</span>
                <span className="text-zinc-500">
                  {t.double_failures} double-failure · {t.render_errors} render · {t.compile_errors} compile
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Tenants</h2>
          <div className="text-xs text-zinc-500">{tenants.length} total</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Tenant</th>
                <th className="py-2 pr-3">Codegen</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3 text-right">Attempts</th>
                <th className="py-2 pr-3 text-right">Compile err</th>
                <th className="py-2 pr-3 text-right">Double</th>
                <th className="py-2 pr-3 text-right">Render</th>
                <th className="py-2 pr-3">Breaker</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.tenant_id} className="border-t">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-zinc-500">{t.slug}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-block h-2 w-2 rounded-full mr-2 ${
                        t.codegen_enabled ? 'bg-emerald-500' : 'bg-zinc-300'
                      }`}
                    />
                    {t.codegen_enabled ? 'on' : 'off'}
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-500">
                    {t.codegen_enabled_by ?? '—'}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{t.attempts}</td>
                  <td className="py-2 pr-3 text-right font-mono">{t.compile_errors}</td>
                  <td className="py-2 pr-3 text-right font-mono">{t.double_failures}</td>
                  <td className="py-2 pr-3 text-right font-mono">{t.render_errors}</td>
                  <td className="py-2 pr-3">
                    {t.breaker_open ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                        tripped
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                        healthy
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          call('toggle_tenant', {
                            tenant_id: t.tenant_id,
                            enabled: !t.codegen_enabled,
                          })
                        }
                        disabled={busy !== null || pending}
                        className="text-xs h-7 px-2 rounded-full border hover:bg-zinc-50"
                      >
                        {t.codegen_enabled ? 'Disable' : 'Enable'}
                      </button>
                      {t.breaker_open && (
                        <button
                          type="button"
                          onClick={() => call('reset_breaker', { trip_id: t.open_trip_id })}
                          disabled={busy !== null || pending}
                          className="text-xs h-7 px-2 rounded-full border bg-amber-50 text-amber-700 hover:bg-amber-100"
                        >
                          Reset breaker
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">Circuit breaker history</h2>
        {trips.length === 0 ? (
          <p className="text-sm text-zinc-500">No trips recorded.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {trips.map((tr) => (
              <li key={tr.id} className="border-b pb-2 last:border-b-0">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{tr.reason}</span>
                    {tr.tenant_id ? (
                      <span className="text-zinc-500 ml-2 text-xs">tenant {tr.tenant_id.slice(0, 8)}…</span>
                    ) : (
                      <span className="text-zinc-500 ml-2 text-xs">global</span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(tr.tripped_at).toLocaleString()} ·{' '}
                    {tr.reset_at ? 'reset' : 'open'}
                  </span>
                </div>
                {tr.metric_snapshot && (
                  <pre className="text-xs text-zinc-500 mt-1 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(tr.metric_snapshot)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">Recent events (last 100)</h2>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet. Codegen hasn&apos;t run in the last 24h.</p>
        ) : (
          <ul className="text-xs font-mono space-y-1 max-h-96 overflow-auto">
            {events.map((ev) => (
              <li key={ev.id} className="border-b pb-1 last:border-b-0">
                <span className="text-zinc-500">{new Date(ev.created_at).toLocaleTimeString()}</span>{' '}
                <span className="font-semibold">{ev.event_type}</span>{' '}
                <span className="text-zinc-500">{ev.tenant_id?.slice(0, 8) ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
