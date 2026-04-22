'use client';

// Live-ops chat panel. Posts messages to /api/admin/ai/chat and applies the
// returned actions by calling admin APIs. After every mutation we
// router.refresh() so server components (tenant settings, menu) re-evaluate
// and reflect the change without a full page reload.
//
// Chat history is persisted to localStorage per-tenant so returning owners
// see their previous conversation. Last 50 messages kept to keep context
// small for the Claude call.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Send, Sparkles } from 'lucide-react';
import type { PublicTenant, ThemeTemplate } from '@/lib/tenant';
import type { TenantColors } from '@/lib/onboarding/types';

type AdminAction =
  | { type: 'update_tagline'; tagline: string }
  | { type: 'update_colors'; colors: Partial<TenantColors> }
  | { type: 'set_template'; template: ThemeTemplate }
  | { type: 'update_hours'; hours: Record<string, { open: string; close: string }> }
  | {
      type: 'update_menu_item';
      id: string;
      field: 'name' | 'price' | 'description' | 'is_available';
      value: string | number | boolean;
    }
  | {
      type: 'add_item';
      category_id: string;
      name: string;
      price: number;
      description?: string;
    }
  | { type: 'remove_item'; id: string };

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind?: 'text' | 'error';
}

const STARTER = {
  role: 'assistant' as const,
  content:
    'Halo! Gue siap bantu kelola toko kamu. Bilang aja apa yang mau diubah — menu, harga, warna, jam buka, layout.\n\nContoh: "Nasi goreng habis hari ini", "Naikin harga kopi susu jadi 30rb", "Tambahin es kopi susu 15rb ke minuman", "Ganti layout kayak warteg".',
};

const HISTORY_KEY = (tenantId: string) => `sajian-admin-chat-${tenantId}`;
const MAX_HISTORY = 50;

function loadHistory(tenantId: string): Message[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(HISTORY_KEY(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (m): m is Message =>
        m && typeof m === 'object' && typeof m.id === 'string' && (m.role === 'user' || m.role === 'assistant'),
    );
  } catch {
    return null;
  }
}

function saveHistory(tenantId: string, messages: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = messages.slice(-MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY(tenantId), JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — acceptable to silently skip.
  }
}

export function AdminChat({
  tenant,
  onAfterMutate,
  fill = false,
}: {
  tenant: PublicTenant;
  onAfterMutate?: () => void;
  fill?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() => {
    const restored = typeof window !== 'undefined' ? loadHistory(tenant.id) : null;
    if (restored && restored.length > 0) return restored;
    return [{ id: 'starter', ...STARTER, kind: 'text' }];
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending, applying]);

  useEffect(() => {
    saveHistory(tenant.id, messages);
  }, [messages, tenant.id]);

  function resetChat() {
    if (!confirm('Mulai ulang chat? Riwayat sebelumnya akan dihapus.')) return;
    const starter: Message = { id: 'starter', ...STARTER, kind: 'text' };
    setMessages([starter]);
    saveHistory(tenant.id, [starter]);
  }

  async function applyAction(action: AdminAction): Promise<{ ok: boolean; note?: string }> {
    try {
      if (action.type === 'update_menu_item') {
        const patch: Record<string, unknown> = {};
        patch[action.field] = action.value;
        const res = await fetch(`/api/admin/menu/${action.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const body = await res.json();
        if (!res.ok) return { ok: false, note: body.error ?? 'menu edit gagal' };
        return { ok: true };
      }

      if (action.type === 'add_item') {
        const res = await fetch('/api/admin/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: action.category_id,
            name: action.name,
            price: action.price,
            description: action.description ?? null,
          }),
        });
        const body = await res.json();
        if (!res.ok) return { ok: false, note: body.error ?? 'tambah item gagal' };
        return { ok: true };
      }

      if (action.type === 'remove_item') {
        const res = await fetch(`/api/admin/menu/${action.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, note: body.error ?? 'hapus gagal' };
        }
        return { ok: true };
      }

      const patch: Record<string, unknown> = {};
      if (action.type === 'update_tagline') patch.tagline = action.tagline;
      if (action.type === 'update_colors') patch.colors = action.colors;
      if (action.type === 'set_template') patch.theme_template = action.template;
      if (action.type === 'update_hours') patch.operating_hours = action.hours;

      const res = await fetch('/api/admin/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) return { ok: false, note: body.error ?? 'update gagal' };
      return { ok: true };
    } catch (e) {
      return { ok: false, note: (e as Error).message };
    }
  }

  async function send(text: string) {
    if (!text.trim() || sending) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      kind: 'text',
    };
    setMessages((cur) => [...cur, userMsg]);
    setInput('');
    setSending(true);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'AI gagal merespon');

      setMessages((cur) => [
        ...cur,
        { id: crypto.randomUUID(), role: 'assistant', content: body.message, kind: 'text' },
      ]);

      const actions: AdminAction[] = Array.isArray(body.actions) ? body.actions : [];
      if (actions.length > 0) {
        setApplying(true);
        const results: Array<{ ok: boolean; note?: string }> = [];
        for (const a of actions) results.push(await applyAction(a));
        const failed = results.filter((r) => !r.ok);
        if (failed.length === 0) {
          setMessages((cur) => [
            ...cur,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content:
                actions.length === 1
                  ? 'Selesai. Perubahan udah live.'
                  : `Selesai. ${actions.length} perubahan udah live.`,
              kind: 'text',
            },
          ]);
          router.refresh();
          onAfterMutate?.();
        } else {
          setMessages((cur) => [
            ...cur,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Gagal update ${failed.length} dari ${actions.length}: ${failed
                .map((f) => f.note)
                .filter(Boolean)
                .join(', ')}`,
              kind: 'error',
            },
          ]);
        }
        setApplying(false);
      }
    } catch (e) {
      setMessages((cur) => [
        ...cur,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ ${(e as Error).message}`,
          kind: 'error',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const primary = tenant.colors.primary;
  const containerClass = fill
    ? 'flex flex-col rounded-2xl border border-zinc-200 bg-white overflow-hidden h-full min-h-0'
    : 'max-w-3xl flex flex-col rounded-2xl border border-zinc-200 bg-white overflow-hidden';
  const containerStyle = fill ? undefined : { height: '68vh', minHeight: 480 };

  return (
    <div className={containerClass} style={containerStyle}>
      <div
        className="flex items-center gap-2 px-4 py-3 border-b text-xs"
        style={{ borderColor: `${primary}18`, color: primary }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="font-medium uppercase tracking-[0.12em]">AI management</span>
        <span className="text-zinc-400 ml-auto hidden sm:inline">Perubahan langsung live</span>
        <button
          type="button"
          onClick={resetChat}
          title="Mulai ulang chat"
          className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-700 transition text-[11px]"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} primary={primary} />
        ))}
        {(sending || applying) && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 pl-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {applying ? 'Menerapkan perubahan…' : 'AI lagi mikir…'}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t p-3 bg-zinc-50"
        style={{ borderColor: `${primary}18` }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Contoh: "Nasi goreng habis hari ini"'
          disabled={sending}
          className="flex-1 h-11 px-4 rounded-full border border-zinc-200 bg-white text-sm focus:outline-none focus:border-zinc-400"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Kirim"
          className="h-11 w-11 rounded-full text-white flex items-center justify-center disabled:opacity-40"
          style={{ background: primary }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Bubble({ msg, primary }: { msg: Message; primary: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? { background: primary, color: '#fff', borderBottomRightRadius: 6 }
            : msg.kind === 'error'
              ? { background: '#FEE2E2', color: '#991B1B', borderBottomLeftRadius: 6 }
              : { background: '#F4F4F5', color: '#18181B', borderBottomLeftRadius: 6 }
        }
      >
        {msg.content}
      </div>
    </div>
  );
}
