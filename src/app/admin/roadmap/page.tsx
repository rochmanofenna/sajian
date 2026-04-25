// /admin/roadmap — operator dashboard for the third response pattern.
// Shows what tenants keep asking for, grouped by category, sorted by
// total upvotes. Operators flip status (planned/in_progress/shipped/
// wont_do) inline. Plain table — this is product-prioritization, not
// marketing.

import Link from 'next/link';
import { getAdminOperatorOrNull } from '@/lib/admin/is-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { RoadmapOpsClient } from '@/components/admin/RoadmapOpsClient';

interface RawRoadmapRow {
  id: string;
  tenant_id: string | null;
  ai_categorization: string;
  raw_user_message: string;
  workaround_offered: string | null;
  upvote_count: number;
  status: string;
  resolved_note: string | null;
  created_at: string;
  // Supabase types nested relations as an array even when 1:1 — we
  // flatten it before passing to the client.
  tenants: Array<{ slug: string; name: string }> | { slug: string; name: string } | null;
}

interface RoadmapRow extends Omit<RawRoadmapRow, 'tenants'> {
  tenants?: { slug: string; name: string } | null;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function RoadmapOpsPage() {
  const operator = await getAdminOperatorOrNull();
  if (!operator) {
    return (
      <div className="flex items-center justify-center py-24 px-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold">Tidak tersedia</h1>
          <p className="text-sm text-zinc-600">
            Halaman ini hanya untuk operator Sajian.{' '}
            <Link href="/admin" className="underline">
              Buka dashboard admin toko
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const service = createServiceClient();
  const { data } = await service
    .from('roadmap_requests')
    .select(
      'id, tenant_id, ai_categorization, raw_user_message, workaround_offered, upvote_count, status, resolved_note, created_at, tenants(slug, name)',
    )
    .order('upvote_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  const rows: RoadmapRow[] = ((data ?? []) as RawRoadmapRow[]).map((r) => {
    const tenants = Array.isArray(r.tenants) ? r.tenants[0] ?? null : r.tenants ?? null;
    return { ...r, tenants };
  });

  // Aggregate by category for the top summary band.
  const byCategory = new Map<string, { open: number; total: number; upvotes: number }>();
  for (const r of rows) {
    const k = r.ai_categorization;
    if (!byCategory.has(k)) byCategory.set(k, { open: 0, total: 0, upvotes: 0 });
    const bucket = byCategory.get(k)!;
    bucket.total += 1;
    bucket.upvotes += r.upvote_count;
    if (r.status === 'open') bucket.open += 1;
  }
  const categorySummary = Array.from(byCategory.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.upvotes - a.upvotes);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Roadmap requests</h1>
        <p className="text-sm text-zinc-500 mt-1">
          What tenants keep asking the AI for. Grouped by category, sorted by upvotes.
          Operator: {operator.email ?? operator.userId}.
        </p>
      </header>
      <RoadmapOpsClient rows={rows} categorySummary={categorySummary} />
    </div>
  );
}
