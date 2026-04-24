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
  const setItemImage = useOnboarding((s) => s.setItemImage);
  const addSection = useOnboarding((s) => s.addSection);
  const removeSection = useOnboarding((s) => s.removeSection);
  const updateSectionVariant = useOnboarding((s) => s.updateSectionVariant);
  const updateSectionProps = useOnboarding((s) => s.updateSectionProps);
  const toggleSection = useOnboarding((s) => s.toggleSection);
  const reorderSections = useOnboarding((s) => s.reorderSections);
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
      case 'generate_food_photo':
        await generateFoodPhoto(action.item);
        break;
      case 'generate_all_photos':
        await generateAllFoodPhotos();
        break;
      case 'add_section':
        await addSection({
          type: action.section_type,
          variant: action.variant,
          props: action.props,
          position: action.position,
        });
        break;
      case 'remove_section':
        await removeSection(action.section_id);
        break;
      case 'update_section_variant':
        await updateSectionVariant(action.section_id, action.variant);
        break;
      case 'update_section_props':
        await updateSectionProps(action.section_id, action.props);
        break;
      case 'toggle_section':
        await toggleSection(action.section_id, action.visible);
        break;
      case 'reorder_sections':
        await reorderSections(action.order);
        break;
      case 'generate_section_image':
        await generateSectionImage(action.section_id, action.prompt, action.prop_key);
        break;
      case 'generate_hero_image':
        await generateHeroImage(action.prompt);
        break;
      case 'add_custom_section':
        await applyAddCustomSection(action.source_jsx, action.position);
        break;
      case 'update_custom_section':
        await applyUpdateCustomSection(action.section_id, action.source_jsx);
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

  // Look an item up case-insensitively across all categories, then call the
  // food-photo endpoint and patch its image_url on success.
  async function generateFoodPhoto(itemName: string): Promise<boolean> {
    const needle = itemName.trim().toLowerCase();
    let found: { name: string; description?: string; category: string } | null = null;
    for (const cat of draft.menu_categories ?? []) {
      for (const item of cat.items) {
        if (item.name.trim().toLowerCase() === needle) {
          found = { name: item.name, description: item.description, category: cat.name };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      await pushMessage({
        role: 'assistant',
        content: `Aku belum nemu item "${itemName}" di menu. Cek nama item yang mau difoto?`,
        kind: 'text',
      });
      return false;
    }
    setUploading('logo');
    try {
      const res = await fetch('/api/ai/generate-food-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: found.name,
          description: found.description,
          category: found.category,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.image_url) {
        console.error('[chat] food photo failed', body);
        await pushMessage({
          role: 'assistant',
          content: `Gagal bikin foto "${found.name}". Coba lagi sebentar lagi.`,
          kind: 'text',
        });
        return false;
      }
      await setItemImage(found.name, body.image_url);
      return true;
    } catch (err) {
      console.error('[chat] food photo threw', err);
      return false;
    } finally {
      setUploading(null);
    }
  }

  // Generate a DALL-E image and stash it on the target section's props bag.
  // `propKey` defaults to "image_url"; override for e.g. heroImageUrl.
  async function generateSectionImage(
    sectionId: string,
    prompt?: string,
    propKey?: string,
  ): Promise<boolean> {
    const sections = draft.sections ?? [];
    const target = sections.find((s) => s.id === sectionId);
    if (!target) {
      console.warn('[chat] generate_section_image: section not found', sectionId);
      return false;
    }
    setUploading('logo');
    try {
      const res = await fetch('/api/ai/generate-section-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: target.type,
          prompt,
          extra: `Restoran: ${draft.name ?? ''}. ${draft.food_type ?? ''}`,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.image_url) {
        console.error('[chat] section image failed', body);
        await pushMessage({
          role: 'assistant',
          content: 'Foto section gagal dibuat. Coba lagi sebentar lagi.',
          kind: 'text',
        });
        return false;
      }
      const key = propKey ?? 'image_url';
      await updateSectionProps(sectionId, { [key]: body.image_url });
      return true;
    } catch (err) {
      console.error('[chat] section image threw', err);
      return false;
    } finally {
      setUploading(null);
    }
  }

  // Hero images live on the tenant (not inside a section prop) so the
  // legacy template path also picks them up. Promote to draft.hero_image_url.
  async function generateHeroImage(prompt?: string): Promise<boolean> {
    setUploading('logo');
    try {
      const res = await fetch('/api/ai/generate-section-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: 'hero',
          prompt,
          extra: `Restoran: ${draft.name ?? ''}. ${draft.food_type ?? ''}`,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.image_url) {
        console.error('[chat] hero image failed', body);
        await pushMessage({
          role: 'assistant',
          content: 'Foto hero gagal dibuat. Coba lagi sebentar.',
          kind: 'text',
        });
        return false;
      }
      await patchDraft({ hero_image_url: body.image_url });
      return true;
    } catch (err) {
      console.error('[chat] hero image threw', err);
      return false;
    } finally {
      setUploading(null);
    }
  }

  // Add-custom-section flow with one automatic retry. We create an
  // empty custom section first so /api/sections/compile has a row to
  // write into, then POST the source_jsx. On sanitizer / compile
  // failure we fire a follow-up turn to Claude with the error
  // appended, accept its retry emit, and try one more time. Two
  // failures → owner gets a short "ada kendala" message and we log
  // the double failure for prompt tuning.
  async function applyAddCustomSection(
    sourceJsx: string,
    position: 'start' | 'end' | `after:${string}` | `before:${string}` | undefined,
  ): Promise<void> {
    const sectionId = await addSection({
      type: 'custom',
      variant: 'codegen',
      props: {},
      position,
    });
    if (!sectionId) return;
    await compileWithRetry(sectionId, sourceJsx);
  }

  async function applyUpdateCustomSection(sectionId: string, sourceJsx: string): Promise<void> {
    await compileWithRetry(sectionId, sourceJsx);
  }

  async function callCompile(
    sectionId: string,
    sourceJsx: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/sections/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: sectionId, source_jsx: sourceJsx }),
      });
      const body = await res.json();
      if (res.ok && body.ok) return { ok: true };
      const stage = typeof body.stage === 'string' ? body.stage : 'unknown';
      const errMsg =
        typeof body?.error === 'object' && body.error
          ? (body.error as { message?: string }).message ?? JSON.stringify(body.error)
          : typeof body?.error === 'string'
            ? body.error
            : `compile failed (${stage})`;
      return { ok: false, error: `[${stage}] ${errMsg}` };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async function requestRetryFromAi(
    sectionId: string,
    previousSource: string,
    error: string,
  ): Promise<string | null> {
    const retryPrompt = `The source_jsx you just emitted for section ${sectionId} failed to compile:

ERROR: ${error}

The source was:
\`\`\`jsx
${previousSource}
\`\`\`

Rewrite the source_jsx to fix this. Use only the allowed primitives (Motion, Overlay, Stack, Box, Countdown, Scheduled, TimeOfDay, Text, Image, Button, Icon) and hooks (useState, useMemo). Emit exactly one update_custom_section action targeting this section_id. Keep it simple.`;

    try {
      const history = [
        ...messages,
        { role: 'user' as const, content: retryPrompt, kind: 'text' as const },
      ]
        .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, draft }),
      });
      const body = await res.json();
      if (!res.ok) return null;
      const actions = Array.isArray(body.actions) ? body.actions : [];
      for (const a of actions) {
        if (
          a?.type === 'update_custom_section' &&
          a.section_id === sectionId &&
          typeof a.source_jsx === 'string'
        ) {
          return a.source_jsx as string;
        }
        if (a?.type === 'add_custom_section' && typeof a.source_jsx === 'string') {
          return a.source_jsx as string;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async function compileWithRetry(sectionId: string, sourceJsx: string): Promise<void> {
    let attempt = 1;
    let currentSource = sourceJsx;
    while (attempt <= 2) {
      const result = await callCompile(sectionId, currentSource);
      if (result.ok) {
        if (attempt > 1) {
          await pushMessage({
            role: 'assistant',
            content: 'Udah aku benerin — cek preview ya.',
            kind: 'text',
          });
        }
        return;
      }
      console.warn('[codegen] compile failed', { sectionId, attempt, error: result.error });
      if (attempt >= 2) {
        console.error('[codegen] double failure', {
          sectionId,
          source_excerpt: currentSource.slice(0, 400),
          final_error: result.error,
        });
        await pushMessage({
          role: 'assistant',
          content:
            'Aku coba bikin fitur itu tapi ada kendala teknis. Coba minta dengan cara lain atau pecah jadi langkah lebih kecil.',
          kind: 'text',
        });
        return;
      }
      const retrySource = await requestRetryFromAi(sectionId, currentSource, result.error);
      if (!retrySource) {
        await pushMessage({
          role: 'assistant',
          content:
            'Aku coba bikin fitur itu tapi ada kendala. Coba minta dengan kata lain atau lebih spesifik.',
          kind: 'text',
        });
        return;
      }
      currentSource = retrySource;
      attempt += 1;
    }
  }

  async function generateAllFoodPhotos() {
    const targets: Array<{ name: string }> = [];
    for (const cat of draft.menu_categories ?? []) {
      for (const item of cat.items) {
        if (!item.image_url) targets.push({ name: item.name });
      }
    }
    if (targets.length === 0) {
      await pushMessage({
        role: 'assistant',
        content: 'Semua menu kamu udah ada fotonya!',
        kind: 'text',
      });
      return;
    }
    await pushMessage({
      role: 'assistant',
      content: `Oke, aku bikinin foto buat ${targets.length} item. Ini bisa makan waktu ~${targets.length * 10} detik — lihat preview update satu per satu.`,
      kind: 'text',
    });
    for (const t of targets) {
      await generateFoodPhoto(t.name);
      await new Promise((r) => setTimeout(r, 400));
    }
    await pushMessage({
      role: 'assistant',
      content: 'Beres! Semua menu udah punya foto. Cek preview-nya.',
      kind: 'text',
    });
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

      // New shape returns multiple options. Preselect the first so the
      // preview has something immediately; owner can tap a different tile
      // in the chat to swap.
      const logos: string[] = Array.isArray(body.logos) ? body.logos.filter(Boolean) : [];
      const primaryLogo = logos[0] ?? body.logo_url;
      if (!primaryLogo) throw new Error('Logo tidak tersedia');

      await patchDraft({ logo_url: primaryLogo });

      if (logos.length > 1) {
        await pushMessage({
          role: 'assistant',
          content: 'Ini 3 opsi logo. Tap salah satu buat dipake, atau minta aku bikinin lagi kalau gak ada yang cocok.',
          kind: 'logo_options',
          payload: { logos },
        });
      } else {
        await pushMessage({
          role: 'assistant',
          content: 'Logo udah jadi. Kalau mau beda tinggal bilang aja, atau upload logo kamu sendiri.',
          kind: 'logo_uploaded',
          attachments: [
            {
              type: 'image',
              url: primaryLogo,
              name: `${draft.name}-logo.png`,
              mime: 'image/png',
            },
          ],
        });
      }
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
