'use client';

// Client interactivity for /admin/roadmap. Status flips hit
// /api/admin/roadmap-requests/[id], then we router.refresh() to pick
// up the new state. No optimistic update — the dashboard is low-
// frequency and clarity > snappiness.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface RoadmapRow {
  id: string;
  tenant_id: string | null;
  ai_categorization: string;
  raw_user_message: string;
  workaround_offered: string | null;
  upvote_count: number;
  status: string;
  resolved_note: string | null;
  created_at: string;
  tenants?: { slug: string; name: string } | null;
}

interface CategorySummary {
  category: string;
  open: number;
  total: number;
  upvotes: number;
}

const STATUS_OPTIONS: Array<{ value: string; label: string; tone: string }> = [
  { value: 'open', label: 'Open', tone: 'bg-amber-100 text-amber-800' },
  { value: 'planned', label: 'Planned', tone: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In progress', tone: 'bg-violet-100 text-violet-800' },
  { value: 'shipped', label: 'Shipped', tone: 'bg-emerald-100 text-emerald-800' },
  { value: 'wont_do', label: "Won't do", tone: 'bg-zinc-200 text-zinc-700' },
];
const STATUS_TONE = new Map(STATUS_OPTIONS.map((s) => [s.value, s.tone] as const));

export function RoadmapOpsClient({
  rows,
  categorySummary,
}: {
  rows: RoadmapRow[];
  categorySummary: CategorySummary[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, payload: Record<string, unknown>) {
    setError(null);
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/roadmap-requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'patch failed');
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">By category</h2>
        {categorySummary.length === 0 ? (
          <p className="text-sm text-zinc-500">No requests yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Upvotes</th>
                <th className="py-2 pr-3 text-right">Open</th>
                <th className="py-2 pr-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {categorySummary.map((c) => (
                <tr key={c.category} className="border-t">
                  <td className="py-2 pr-3 font-medium capitalize">
                    {c.category.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{c.upvotes}</td>
                  <td className="py-2 pr-3 text-right font-mono">{c.open}</td>
                  <td className="py-2 pr-3 text-right font-mono">{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">All requests</h2>
          <div className="text-xs text-zinc-500">{rows.length} rows</div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No requests logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          STATUS_TONE.get(r.status) ?? 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-zinc-500">
                        {r.ai_categorization.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-zinc-500">·</span>
                      <span className="text-xs font-mono text-zinc-500">
                        +{r.upvote_count}
                      </span>
                      {r.tenants && (
                        <>
                          <span className="text-xs text-zinc-500">·</span>
                          <span className="text-xs text-zinc-600">
                            {r.tenants.name} ({r.tenants.slug})
                          </span>
                        </>
                      )}
                      <span className="text-xs text-zinc-500">·</span>
                      <span className="text-xs text-zinc-500">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{r.raw_user_message}</p>
                    {r.workaround_offered && (
                      <p className="text-xs text-zinc-500">
                        Workaround offered: {r.workaround_offered}
                      </p>
                    )}
                    {r.resolved_note && (
                      <p className="text-xs text-emerald-700">Note: {r.resolved_note}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-wrap gap-1">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        disabled={busy === r.id || pending || r.status === s.value}
                        onClick={() => patch(r.id, { status: s.value })}
                        className={`text-xs h-7 px-2 rounded-full border ${
                          r.status === s.value
                            ? 'border-zinc-900 text-zinc-900 bg-zinc-100'
                            : 'border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
