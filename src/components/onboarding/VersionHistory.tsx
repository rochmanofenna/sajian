'use client';

// Version history timeline. Grouped by date (matches the Lovable UX).
// Each entry shows the section type, who authored it, and a one-line
// summary. Clicking "Pulihkan" hits /api/sections/restore; the UI
// optimistically updates the bookmark list inline.

import { useEffect, useState } from 'react';

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

interface HistoryResponse {
  groups: { date: string; entries: HistoryEntry[] }[];
  bookmarked: HistoryEntry[];
}

function sourceBadgeStyle(source: string): { label: string; bg: string; color: string } {
  switch (source) {
    case 'ai':
      return { label: 'AI', bg: '#1B5E3B', color: '#FDF6EC' };
    case 'owner':
      return { label: 'Owner', bg: '#C9A84C', color: '#1A1A18' };
    case 'restore':
      return { label: 'Restore', bg: '#5B3C9A', color: '#FDF6EC' };
    case 'backfill':
      return { label: 'Awal', bg: '#e4e4e7', color: '#52525b' };
    default:
      return { label: source, bg: '#f4f4f5', color: '#52525b' };
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function VersionHistory() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/sections/versions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        if (!active) return;
        if (body?.groups) setData(body as HistoryResponse);
        else setError(body?.error ?? 'Gagal memuat riwayat');
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function restore(entry: HistoryEntry) {
    if (!window.confirm(`Pulihkan ${entry.section_type} ke versi #${entry.version_number}?`)) {
      return;
    }
    setBusy(entry.version_id);
    try {
      const res = await fetch('/api/sections/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: entry.section_id, version_id: entry.version_id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Restore gagal');
      window.location.href = '/setup';
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function bookmark(entry: HistoryEntry) {
    const label = window.prompt('Nama versi ini (contoh: "Sebelum promo lebaran")');
    if (!label || label.trim().length === 0) return;
    setBusy(`bm:${entry.version_id}`);
    try {
      const res = await fetch('/api/sections/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: entry.version_id, label: label.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal menyimpan bookmark');
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) => ({
            ...g,
            entries: g.entries.map((e) =>
              e.version_id === entry.version_id ? { ...e, bookmark_label: label.trim() } : e,
            ),
          })),
        };
      });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-8 text-sm text-zinc-500">Memuat riwayat…</div>;
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const hasAny = data.groups.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Riwayat perubahan</h1>
        <p className="text-sm opacity-70">
          Setiap perubahan di toko tersimpan otomatis. Pulihkan ke versi mana pun — nggak ada yang hilang.
        </p>
      </header>

      {data.bookmarked.length > 0 && (
        <section>
          <h2 className="text-xs font-mono uppercase tracking-[0.18em] opacity-60 mb-3">
            Dibookmark
          </h2>
          <div className="space-y-2">
            {data.bookmarked.map((e) => (
              <Entry key={e.version_id} entry={e} busy={busy} onRestore={restore} onBookmark={bookmark} pinned />
            ))}
          </div>
        </section>
      )}

      {hasAny ? (
        data.groups.map((g) => (
          <section key={g.date} className="space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-[0.18em] opacity-60">
              {formatDate(g.date)}
            </h2>
            <div className="space-y-2">
              {g.entries.map((e) => (
                <Entry
                  key={e.version_id}
                  entry={e}
                  busy={busy}
                  onRestore={restore}
                  onBookmark={bookmark}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="text-sm opacity-60 py-12 text-center">
          Belum ada perubahan yang tersimpan.
        </div>
      )}
    </div>
  );
}

function Entry({
  entry,
  busy,
  onRestore,
  onBookmark,
  pinned,
}: {
  entry: HistoryEntry;
  busy: string | null;
  onRestore: (e: HistoryEntry) => void;
  onBookmark: (e: HistoryEntry) => void;
  pinned?: boolean;
}) {
  const badge = sourceBadgeStyle(entry.source);
  return (
    <div
      className="rounded-2xl border p-4 flex items-start gap-3"
      style={{
        borderColor: pinned ? 'rgba(27, 94, 59, 0.4)' : 'rgba(10, 11, 10, 0.08)',
        background: pinned ? 'rgba(27, 94, 59, 0.04)' : '#fff',
      }}
    >
      <span
        className="text-[10px] font-mono uppercase tracking-[0.14em] rounded-full px-2 py-1 flex-shrink-0"
        style={{ background: badge.bg, color: badge.color }}
      >
        {badge.label}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{entry.section_type}</span>
          <span className="text-xs opacity-50">·</span>
          <span className="text-xs opacity-70">{entry.section_variant}</span>
          <span className="text-xs opacity-50">·</span>
          <span className="text-xs opacity-70">v{entry.version_number}</span>
          <span className="text-xs opacity-50">·</span>
          <span className="text-xs opacity-60 font-mono">{formatTime(entry.created_at)}</span>
        </div>
        <div className="text-sm opacity-80">{entry.summary}</div>
        {entry.bookmark_label && (
          <div className="text-xs italic opacity-70">— {entry.bookmark_label}</div>
        )}
      </div>
      <div className="flex flex-col gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onRestore(entry)}
          disabled={busy === entry.version_id}
          className="text-xs px-3 h-8 rounded-full border hover:bg-zinc-50 disabled:opacity-50"
          style={{ borderColor: 'rgba(10, 11, 10, 0.14)' }}
        >
          {busy === entry.version_id ? 'Memulihkan…' : 'Pulihkan'}
        </button>
        {!entry.bookmark_label && (
          <button
            type="button"
            onClick={() => onBookmark(entry)}
            disabled={busy === `bm:${entry.version_id}`}
            className="text-xs px-3 h-8 rounded-full border hover:bg-zinc-50 disabled:opacity-50"
            style={{ borderColor: 'rgba(10, 11, 10, 0.14)' }}
          >
            Bookmark
          </button>
        )}
      </div>
    </div>
  );
}
