'use client';

// The left-side conversation pane. Wires:
//   • message list ↔ useOnboarding.messages
//   • text input → /api/ai/chat
//   • menu upload button → /api/ai/extract-menu
//   • storefront photo → /api/ai/extract-colors
//   • applies any ACTION the chat route returns
//
// The AI's first turn is scripted: "halo, apa nama restoran kamu?" We don't
// round-trip the initial greeting.

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/store';
import { generateSlug } from '@/lib/onboarding/slug';
import type { OnboardingAction, CategoryDraft } from '@/lib/onboarding/types';
import { ChatMessage } from './ChatMessage';
import { PhotoUpload } from './PhotoUpload';

export function ChatPanel({ onLaunch }: { onLaunch: () => void }) {
  const messages = useOnboarding((s) => s.messages);
  const draft = useOnboarding((s) => s.draft);
  const pushMessage = useOnboarding((s) => s.pushMessage);
  const patchDraft = useOnboarding((s) => s.patchDraft);
  const setMenu = useOnboarding((s) => s.setMenu);
  const addItem = useOnboarding((s) => s.addItem);
  const removeItem = useOnboarding((s) => s.removeItem);
  const updateItem = useOnboarding((s) => s.updateItem);
  const loading = useOnboarding((s) => s.loading);
  const setLoading = useOnboarding((s) => s.setLoading);

  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState<'menu' | 'storefront' | 'logo' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Seed the greeting once if the chat is empty.
  useEffect(() => {
    if (messages.length === 0) {
      pushMessage({
        role: 'assistant',
        content:
          'Halo! 👋 Aku asisten Sajian. Aku bakal bantu kamu bikin halaman pemesanan online buat restoran kamu. Prosesnya sekitar 15 menit.\n\nPertama, apa nama restoran kamu?',
        kind: 'text',
      });
    }
  }, [messages.length, pushMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function applyAction(action: OnboardingAction) {
    switch (action.type) {
      case 'update_name':
        await patchDraft({ name: action.name, slug: generateSlug(action.name) });
        break;
      case 'update_food_type':
        await patchDraft({ food_type: action.food_type });
        break;
      case 'update_tagline':
        await patchDraft({ tagline: action.tagline });
        break;
      case 'update_colors':
        await patchDraft({ colors: { ...(draft.colors ?? { primary: '#1B5E3B', accent: '#C9A84C', background: '#FDF6EC', dark: '#1A1A18' }), ...action.colors } });
        break;
      case 'update_hours':
        if (action.hours) await patchDraft({ operating_hours: action.hours });
        break;
      case 'add_menu_item':
        await addItem(action.category, action.item);
        break;
      case 'remove_menu_item':
        await removeItem(action.item);
        break;
      case 'update_menu_item':
        await updateItem(action.item, action.field, action.value);
        break;
      case 'generate_logo':
        await generateLogo();
        break;
      case 'ready_to_launch':
        await pushMessage({
          role: 'assistant',
          content: 'Kalau sudah oke, tap tombol Go Live di bawah buat luncurin restoran kamu ke dunia!',
          kind: 'launch_ready',
        });
        break;
    }
  }

  async function generateLogo() {
    if (!draft.name) {
      await pushMessage({
        role: 'assistant',
        content: 'Aku butuh nama restoran dulu sebelum bikin logo. Namanya apa?',
        kind: 'text',
      });
      return;
    }
    setUploading('logo');
    try {
      const res = await fetch('/api/ai/generate-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          foodType: draft.food_type,
          primaryColor: draft.colors?.primary,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal bikin logo');
      await patchDraft({ logo_url: body.logo_url });
      await pushMessage({
        role: 'assistant',
        content: 'Logo udah jadi — cek di preview. Kalau mau beda tinggal bilang aja, atau upload logo kamu sendiri.',
        kind: 'text',
      });
    } catch (e) {
      await pushMessage({
        role: 'assistant',
        content: `⚠️ ${(e as Error).message}`,
        kind: 'text',
      });
    } finally {
      setUploading(null);
    }
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user' as const, content: text.trim(), kind: 'text' as const };
    await pushMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal menghubungi AI');

      await pushMessage({ role: 'assistant', content: body.message, kind: 'text' });
      const actions: OnboardingAction[] = Array.isArray(body.actions)
        ? body.actions
        : body.action
          ? [body.action]
          : [];
      for (const a of actions) await applyAction(a);
    } catch (e) {
      await pushMessage({
        role: 'assistant',
        content: `⚠️ Maaf, ada error: ${(e as Error).message}. Coba lagi.`,
        kind: 'text',
      });
    } finally {
      setLoading(false);
    }
  }

  async function uploadMenu(files: File[]) {
    setUploading('menu');
    await pushMessage({
      role: 'user',
      content: `📷 Kirim ${files.length} foto menu`,
      kind: 'text',
    });
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('photos', f));
      const res = await fetch('/api/ai/extract-menu', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) {
        if (body.debug) console.error('[extract-menu] server debug', body.debug);
        throw new Error(body.error ?? 'Gagal baca menu');
      }

      const cats: CategoryDraft[] = body.categories ?? [];
      await setMenu(cats);

      const itemCount = cats.reduce((n, c) => n + c.items.length, 0);
      await pushMessage({
        role: 'assistant',
        content: `Aku berhasil baca ${itemCount} item dari ${cats.length} kategori. Cek di bawah — klik di nama atau harga buat ubah, atau bilang aja ke aku!`,
        kind: 'menu_extracted',
      });
    } catch (e) {
      await pushMessage({
        role: 'assistant',
        content: `⚠️ ${(e as Error).message}`,
        kind: 'text',
      });
    } finally {
      setUploading(null);
    }
  }

  async function uploadStorefront(files: File[]) {
    setUploading('storefront');
    await pushMessage({
      role: 'user',
      content: '📷 Foto depan restoran',
      kind: 'text',
    });
    try {
      const fd = new FormData();
      fd.append('photo', files[0]);
      const res = await fetch('/api/ai/extract-colors', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal analisa warna');

      await patchDraft({
        colors: {
          primary: body.primary,
          accent: body.accent,
          background: body.background,
          dark: body.dark,
        },
      });
      await pushMessage({
        role: 'assistant',
        content: body.reasoning
          ? `Bagus! ${body.reasoning} Klik tiap swatch buat adjust.`
          : 'Warna udah aku extract. Klik tiap swatch kalau mau adjust.',
        kind: 'colors_extracted',
      });
    } catch (e) {
      await pushMessage({
        role: 'assistant',
        content: `⚠️ ${(e as Error).message}`,
        kind: 'text',
      });
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <ChatMessage key={m.id} msg={m} onLaunch={onLaunch} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> AI lagi ngetik…
          </div>
        )}
      </div>

      <div className="border-t border-[#1B5E3B]/10 p-3 space-y-3 bg-white/70">
        <div className="grid grid-cols-2 gap-2">
          <PhotoUpload
            multiple
            label="📷 Foto / PDF menu"
            hint="JPG / PNG / WebP / PDF, max 32MB"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            busy={uploading === 'menu'}
            onFiles={uploadMenu}
          />
          <PhotoUpload
            label="🏪 Foto depan"
            busy={uploading === 'storefront'}
            onFiles={uploadStorefront}
          />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ketik pesan…"
            disabled={loading}
            className="flex-1 h-11 px-4 rounded-full border border-[#1B5E3B]/20 bg-white"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 w-11 rounded-full bg-[#1B5E3B] text-white flex items-center justify-center disabled:opacity-40"
            aria-label="Kirim"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
