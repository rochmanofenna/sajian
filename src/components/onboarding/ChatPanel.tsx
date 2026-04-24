'use client';

// The left-side conversation pane. Wires:
//   • message list ↔ useOnboarding.messages
//   • text input → /api/ai/chat
//   • menu upload → /api/ai/extract-menu
//   • storefront photo → /api/ai/extract-colors
//   • logo upload → /api/onboarding/upload-logo
//   • applies any ACTION the chat route returns
//
// User uploads render as inline attachments (image thumbs for JPG/PNG/WebP,
// a file card for PDFs) inside the user's bubble — no placeholder "Kirim 1
// foto menu" text. The AI's first turn is scripted inside store.init().

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/store';
import { generateSlug } from '@/lib/onboarding/slug';
import type { OnboardingAction, CategoryDraft, ChatAttachment } from '@/lib/onboarding/types';
import { filesToAttachments, fileToAttachment } from '@/lib/onboarding/attachments';
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function applyAction(action: OnboardingAction) {
    // Menu mutations are unavailable for ESB tenants — the authoritative
    // menu lives in ESB, so a local draft edit would never persist and would
    // only confuse the owner. Refuse with a clear message.
    const isEsb = draft.pos_provider === 'esb';
    const menuMutations = new Set(['add_menu_item', 'remove_menu_item', 'update_menu_item']);
    if (isEsb && menuMutations.has(action.type)) {
      await pushMessage({
        role: 'assistant',
        content:
          'Menu disinkronisasi dari ESB — perubahan ini perlu dilakukan di portal ESB ya.',
        kind: 'text',
      });
      return;
    }

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
      case 'set_template':
        await patchDraft({ theme_template: action.template });
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
        content: 'Logo udah jadi. Kalau mau beda tinggal bilang aja, atau upload logo kamu sendiri.',
        kind: 'logo_uploaded',
        attachments: [
          {
            type: 'image',
            url: body.logo_url,
            name: `${draft.name}-logo.png`,
            mime: 'image/png',
          },
        ],
      });
    } catch (e) {
      console.error('[logo] generate failed', e);
      await pushMessage({
        role: 'assistant',
        content: 'Logo gagal dibikin. Coba lagi sebentar atau upload logo kamu sendiri.',
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
      // Keep only messages with non-empty text content — photo-upload
      // bubbles carry content='' and Claude's API rejects an entire request
      // if any entry has empty content.
      const history = [...messages, userMsg]
        .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));
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
      console.error('[chat] send failed', e);
      await pushMessage({
        role: 'assistant',
        content: 'Maaf, ada kendala sebentar. Coba kirim ulang pesan kamu.',
        kind: 'text',
      });
    } finally {
      setLoading(false);
    }
  }

  async function uploadMenu(files: File[]) {
    setUploading('menu');
    // Show what the owner actually uploaded — thumbnails for images, a file
    // card for PDFs — instead of a "Kirim N foto menu" placeholder string.
    const attachments = await filesToAttachments(files);
    await pushMessage({ role: 'user', content: '', kind: 'text', attachments });
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
      console.error('[menu] extraction failed', e);
      await pushMessage({
        role: 'assistant',
        content: 'Gagal baca menu. Coba foto yang lebih jelas atau kirim per halaman.',
        kind: 'text',
      });
    } finally {
      setUploading(null);
    }
  }

  async function uploadStorefront(files: File[]) {
    setUploading('storefront');
    const attachments = await filesToAttachments(files.slice(0, 1));
    await pushMessage({ role: 'user', content: '', kind: 'text', attachments });
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
      console.error('[colors] extraction failed', e);
      await pushMessage({
        role: 'assistant',
        content: 'Gagal analisa warna. Coba foto yang berbeda.',
        kind: 'text',
      });
    } finally {
      setUploading(null);
    }
  }

  async function uploadLogo(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUploading('logo');
    // Thumbnail appears immediately so the owner sees their logo land in the
    // chat. The server response gives us the public URL we patch into the
    // draft — we keep the local thumbnail as the attachment so the bubble
    // stays identical across reloads even if the public URL changes.
    const attachment: ChatAttachment = await fileToAttachment(file);
    await pushMessage({
      role: 'user',
      content: '',
      kind: 'text',
      attachments: [attachment],
    });
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await fetch('/api/onboarding/upload-logo', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal upload logo');
      await patchDraft({ logo_url: body.logo_url });
      await pushMessage({
        role: 'assistant',
        content: 'Logo kamu udah kepasang. Cek di preview — kalau mau ganti tinggal upload lagi atau minta aku bikinin.',
        kind: 'text',
      });
    } catch (e) {
      console.error('[logo] upload failed', e);
      await pushMessage({
        role: 'assistant',
        content: 'Upload logo gagal. Coba file yang berbeda (PNG/SVG/JPG).',
        kind: 'text',
      });
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="ob-panel">
      <div ref={scrollRef} className="ob-panel__scroll">
        {messages.map((m) => (
          <ChatMessage key={m.id} msg={m} onLaunch={onLaunch} />
        ))}
        {loading && (
          <div className="ob-typing">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI lagi mikir…
          </div>
        )}
      </div>

      <div className="ob-panel__dock">
        <div className="ob-panel__uploads">
          <PhotoUpload
            multiple
            label="Menu"
            hint="Foto / PDF · max 32MB"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            busy={uploading === 'menu'}
            onFiles={uploadMenu}
          />
          <PhotoUpload
            label="Logo"
            hint="PNG · SVG · JPG"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            busy={uploading === 'logo'}
            onFiles={uploadLogo}
          />
          <PhotoUpload
            label="Foto brand"
            hint="Buat ambil warna"
            busy={uploading === 'storefront'}
            onFiles={uploadStorefront}
          />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="ob-panel__compose"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ketik pesan ke asisten Sajian…"
            disabled={loading}
            className="ob-panel__input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="ob-panel__send"
            aria-label="Kirim"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
