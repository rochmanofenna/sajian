// GET /api/sections/versions
//
// Returns the current tenant's version history grouped by date.
// Used by the /setup/history admin page; scoped by owner_user_id via
// the existing ownership check.

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VersionRow {
  id: string;
  section_id: string;
  version_number: number;
  type: string;
  variant: string;
  source: string;
  ai_message_id: string | null;
  created_at: string;
  source_jsx: string | null;
}

interface BookmarkRow {
  id: string;
  version_id: string;
  label: string;
}

interface HistoryEntry {
  version_id: string;
  section_id: string;
  section_type: string;
  section_variant: string;
  version_number: number;
  source: string;
  ai_message_id: string | null;
  created_at: string;
  summary: string;
  bookmark_label?: string;
}

function summarize(row: VersionRow): string {
  switch (row.source) {
    case 'backfill':
      return 'Snapshot awal';
    case 'system':
      return 'Diperbarui sistem';
    case 'restore':
      return `Dipulihkan ke versi sebelumnya`;
    case 'ai':
      if (row.source_jsx) {
        const firstLine = row.source_jsx.split('\n').find((l) => l.trim().length > 0);
        return `AI: ${firstLine ? firstLine.slice(0, 80) : 'update'}`;
      }
      return 'Diubah oleh AI';
    case 'owner':
    default:
      return `Diubah manual · ${row.type}/${row.variant}`;
  }
}

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const service = createServiceClient();

    const { data: sectionRows, error: sectionErr } = await service
      .from('storefront_sections')
      .select('id')
      .eq('tenant_id', tenant.id);
    if (sectionErr) throw new Error(sectionErr.message);
    const sectionIds = (sectionRows ?? []).map((s) => s.id as string);
    if (sectionIds.length === 0) {
      return NextResponse.json({ groups: [], bookmarked: [] });
    }

    const { data: versions, error: versionsErr } = await service
      .from('storefront_section_versions')
      .select(
        'id, section_id, version_number, type, variant, source, ai_message_id, created_at, source_jsx',
      )
      .in('section_id', sectionIds)
      .order('created_at', { ascending: false })
      .limit(200);
    if (versionsErr) throw new Error(versionsErr.message);

    const { data: bookmarks, error: bookmarksErr } = await service
      .from('storefront_section_bookmarks')
      .select('id, version_id, label')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });
    if (bookmarksErr) throw new Error(bookmarksErr.message);

    const bookmarkByVersion = new Map<string, BookmarkRow>();
    for (const b of (bookmarks ?? []) as BookmarkRow[]) {
      bookmarkByVersion.set(b.version_id, b);
    }

    const entries: HistoryEntry[] = ((versions ?? []) as VersionRow[]).map((v) => ({
      version_id: v.id,
      section_id: v.section_id,
      section_type: v.type,
      section_variant: v.variant,
      version_number: v.version_number,
      source: v.source,
      ai_message_id: v.ai_message_id,
      created_at: v.created_at,
      summary: summarize(v),
      bookmark_label: bookmarkByVersion.get(v.id)?.label,
    }));

    const groupMap = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      const date = e.created_at.slice(0, 10);
      const arr = groupMap.get(date) ?? [];
      arr.push(e);
      groupMap.set(date, arr);
    }
    const groups = Array.from(groupMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, groupEntries]) => ({ date, entries: groupEntries }));

    const bookmarked = entries.filter((e) => e.bookmark_label);

    return NextResponse.json({ groups, bookmarked });
  } catch (err) {
    return errorResponse(err);
  }
}
