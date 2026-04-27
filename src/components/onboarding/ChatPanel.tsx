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
import type {
  OnboardingAction,
  CategoryDraft,
  ChatAttachment,
  ActionResult,
} from '@/lib/onboarding/types';
import { settingKeys } from '@/lib/tenant-settings/registry';
import { filesToAttachments, fileToAttachment } from '@/lib/onboarding/attachments';
import Link from 'next/link';
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
  // Ring buffer of recent action results — fed back to the AI on the
  // next turn so it can summarize what actually happened instead of
  // guessing. Capped to the last 6 results to keep prompt size bounded.
  const recentActionResultsRef = useRef<ActionResult[]>([]);
  // Tracks the most recent user message so log_roadmap_request can
  // capture it server-side without the AI having to echo it back.
  const lastUserMessageRef = useRef<string>('');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // Helpers for the structured ActionResult contract. Every branch
  // below MUST return one — caller (send) reads the failure list and
  // surfaces real errors instead of letting AI hallucinate success.
  const ok = (
    action: string,
    summary: string,
    data?: Record<string, unknown>,
  ): ActionResult => ({ ok: true, action, summary, data });
  const fail = (
    action: string,
    opts: {
      error_code: string;
      error_human: string;
      suggestion?: string;
      debug?: Record<string, unknown>;
    } | string,
    legacySuggestion?: string,
  ): ActionResult => {
    // Back-compat shorthand: callers that pass a plain string become
    // a generic-coded failure with the string serving as both
    // error_human and (alias) error. New call sites should pass the
    // structured opts object so debug stays out of user copy.
    if (typeof opts === 'string') {
      return {
        ok: false,
        action,
        error_code: 'LEGACY',
        error_human: opts,
        error: opts,
        suggestion: legacySuggestion,
      };
    }
    return {
      ok: false,
      action,
      error_code: opts.error_code,
      error_human: opts.error_human,
      error: opts.error_human,
      suggestion: opts.suggestion,
      debug: opts.debug,
    };
  };

  // Accept either a real section.id (uuid) or a type name (hero,
  // about, contact, …). Returns the resolved id or null if no
  // section matches — caller turns null into a structured failure
  // instead of silently no-oping.
  const resolveSectionRef = (ref: string): string | null => {
    const sections = draft.sections ?? [];
    const direct = sections.find((s) => s.id === ref);
    if (direct) return direct.id;
    const lowered = ref.trim().toLowerCase();
    const byType = sections.find((s) => s.type === lowered);
    if (byType) return byType.id;
    return null;
  };

  async function applyAction(action: OnboardingAction): Promise<ActionResult> {
    const isEsb = draft.pos_provider === 'esb';
    const menuMutations = new Set(['add_menu_item', 'remove_menu_item', 'update_menu_item']);
    if (isEsb && menuMutations.has(action.type)) {
      return fail(action.type, {
        error_code: 'ESB_MENU_LOCKED',
        error_human:
          'Menu disinkronisasi dari ESB — perubahan menu harus dilakukan di portal ESB.',
      });
    }

    try {
      switch (action.type) {
        case 'update_name': {
          // Slug is pinned to the live tenant subdomain once the
          // tenant has launched — regenerating it from the new name
          // would break the preview iframe URL (subdomain DNS won't
          // resolve a slug that doesn't exist) and any QR codes /
          // links the owner has already shared. Only auto-derive the
          // slug for fresh, unlaunched drafts.
          const isLaunched =
            !!draft.slug &&
            (draft.menu_categories?.some((c) => c.items.length > 0) ?? false);
          if (isLaunched) {
            await patchDraft({ name: action.name });
            return ok(
              action.type,
              `nama toko diubah ke "${action.name}" (slug ${draft.slug} tetap)`,
            );
          }
          await patchDraft({ name: action.name, slug: generateSlug(action.name) });
          return ok(action.type, `nama toko diubah ke "${action.name}"`);
        }
        case 'update_food_type':
          await patchDraft({ food_type: action.food_type });
          return ok(action.type, `food type diubah ke "${action.food_type}"`);
        case 'update_tagline':
          await patchDraft({ tagline: action.tagline });
          return ok(action.type, `tagline diubah ke "${action.tagline}"`);
        case 'update_colors':
          await patchDraft({
            colors: {
              ...(draft.colors ?? {
                primary: '#1B5E3B',
                accent: '#C9A84C',
                background: '#FDF6EC',
                dark: '#1A1A18',
              }),
              ...action.colors,
            },
          });
          return ok(action.type, 'palet warna diperbarui');
        case 'update_hours':
          if (action.hours) await patchDraft({ operating_hours: action.hours });
          return ok(action.type, 'jam buka diperbarui');
        case 'add_menu_item':
          await addItem(action.category, action.item);
          return ok(action.type, `menambahkan "${action.item.name}" ke kategori ${action.category}`);
        case 'remove_menu_item':
          await removeItem(action.item);
          return ok(action.type, `menghapus "${action.item}" dari menu`);
        case 'update_menu_item':
          await updateItem(action.item, action.field, action.value);
          return ok(action.type, `${action.field} "${action.item}" diubah`);
        case 'generate_logo':
          await generateLogo();
          return ok(action.type, 'logo digenerate');
        case 'generate_food_photo':
          await generateFoodPhoto(action.item);
          return ok(action.type, `foto "${action.item}" digenerate`);
        case 'generate_all_photos':
          await generateAllFoodPhotos();
          return ok(action.type, 'foto semua menu digenerate');
        case 'add_section':
          await addSection({
            type: action.section_type,
            variant: action.variant,
            props: action.props,
            position: action.position,
          });
          return ok(action.type, `section ${action.section_type} ditambahkan`);
        case 'remove_section': {
          const id = resolveSectionRef(action.section_id);
          if (!id) {
            return fail(action.type, {
              error_code: 'INVALID_SECTION_ID',
              error_human:
                'Section yang kamu sebutin nggak ada di draft. Sebut by nama (misal "testimoni", "kontak") atau cek lagi.',
              suggestion: 'use exact section_id from current_draft_state',
              debug: { ref: action.section_id },
            });
          }
          await removeSection(id);
          return ok(action.type, `section ${id} dihapus`);
        }
        case 'update_section_variant': {
          const id = resolveSectionRef(action.section_id);
          if (!id) {
            return fail(action.type, {
              error_code: 'INVALID_SECTION_ID',
              error_human: 'Section yang kamu sebutin nggak ada di draft.',
              suggestion: 'use exact section_id from current_draft_state',
              debug: { ref: action.section_id },
            });
          }
          await updateSectionVariant(id, action.variant);
          return ok(action.type, `variant section ${id} diubah ke "${action.variant}"`);
        }
        case 'update_section_props': {
          const id = resolveSectionRef(action.section_id);
          if (!id) {
            return fail(action.type, {
              error_code: 'INVALID_SECTION_ID',
              error_human: 'Section yang kamu sebutin nggak ada di draft.',
              suggestion: 'use exact section_id from current_draft_state',
              debug: { ref: action.section_id },
            });
          }
          await updateSectionProps(id, action.props);
          return ok(
            action.type,
            `props section ${id} diperbarui (${Object.keys(action.props).join(', ')})`,
          );
        }
        case 'toggle_section': {
          const id = resolveSectionRef(action.section_id);
          if (!id) {
            return fail(action.type, {
              error_code: 'INVALID_SECTION_ID',
              error_human: 'Section yang kamu sebutin nggak ada di draft.',
              suggestion: 'use exact section_id from current_draft_state',
              debug: { ref: action.section_id },
            });
          }
          await toggleSection(id, action.visible);
          return ok(
            action.type,
            `section ${id} ${action.visible ? 'ditampilkan' : 'disembunyikan'}`,
          );
        }
        case 'reorder_sections': {
          const beforeSections = draft.sections ?? [];
          const before = beforeSections.map((s) => s.id);
          await reorderSections(action.order);
          const afterSections = useOnboarding.getState().draft.sections ?? [];
          const after = afterSections.map((s) => s.id);
          const movedSomething =
            before.length === after.length && before.some((id, i) => id !== after[i]);
          if (!movedSomething) {
            // Build a user-friendly summary of WHAT EXISTS using
            // section types — never user-facing UUIDs. Debug payload
            // carries the raw IDs for logs / Sentry only.
            const knownTypes = afterSections.map((s) => s.type).join(', ');
            return fail(action.type, {
              error_code: 'REORDER_NO_OP',
              error_human: `Urutan section nggak berubah — yang ada di draft: ${knownTypes}. Sebut section by nama (misal "testimoni", "kontak") biar aku bisa atur ulang.`,
              suggestion:
                'use exact section_id values from current_draft_state, or type names that match (hero, about, contact, testimonials, promo, etc)',
              debug: {
                requested_order: action.order,
                actual_ids: after,
              },
            });
          }
          return ok(action.type, `urutan section diubah; sekarang: ${afterSections.map((s) => s.type).join(' → ')}`);
        }
        case 'generate_section_image':
          await generateSectionImage(action.section_id, action.prompt, action.prop_key);
          return ok(action.type, `gambar section ${action.section_id} digenerate`);
        case 'generate_hero_image':
          await generateHeroImage(action.prompt);
          return ok(action.type, 'gambar hero digenerate');
        case 'add_custom_section':
          await applyAddCustomSection(action.source_jsx, action.position);
          return ok(action.type, 'custom section ditambahkan');
        case 'update_custom_section':
          await applyUpdateCustomSection(action.section_id, action.source_jsx);
          return ok(action.type, `custom section ${action.section_id} diperbarui`);
        case 'set_template':
          await patchDraft({ theme_template: action.template });
          return ok(action.type, `template diubah ke "${action.template}"`);
        case 'update_tenant_setting': {
          const result = await applyTenantSetting(action.key, action.value);
          return result;
        }
        case 'add_location': {
          const result = await applyAddLocation(action.name, action.address, action.phone, action.code);
          return result;
        }
        case 'update_location': {
          const result = await applyUpdateLocation(action.location_id, action.fields);
          return result;
        }
        case 'delete_location': {
          const result = await applyDeleteLocation(action.location_id);
          return result;
        }
        case 'add_delivery_zone':
          return await applyAddDeliveryZone(action.name, action.fee_cents, action.radius_km);
        case 'update_delivery_zone':
          return await applyUpdateDeliveryZone(action.zone_id, action.fields);
        case 'delete_delivery_zone':
          return await applyDeleteDeliveryZone(action.zone_id);
        case 'toggle_payment_method':
          return await applyTogglePaymentMethod(action.method, action.enabled, action.config);
        case 'request_custom_domain':
          return await applyRequestCustomDomain(action.domain);
        case 'log_roadmap_request':
          return await applyLogRoadmapRequest(
            action.category,
            action.workaround_offered,
            action.raw_user_message,
          );
        case 'ready_to_launch':
          await pushMessage({
            role: 'assistant',
            content:
              'Kalau sudah oke, tap tombol Go Live di bawah buat luncurin restoran kamu ke dunia!',
            kind: 'launch_ready',
          });
          return ok(action.type, 'launch prompt ditampilkan ke user');
      }
    } catch (err) {
      return fail((action as { type: string }).type, {
        error_code: 'ACTION_THREW',
        error_human: 'Action gagal jalan. Aku coba lagi atau coba pendekatan lain.',
        debug: {
          message: (err as Error).message ?? 'unknown error',
          stack: (err as Error).stack?.split('\n').slice(0, 4).join('\n'),
        },
      });
    }
    return fail((action as { type: string }).type, {
      error_code: 'UNKNOWN_ACTION',
      error_human: 'Aku gak kenal action itu.',
    });
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

  // ── Tenant-settings + locations executors ─────────────────────────
  // The AI's update_tenant_setting / add_location / update_location /
  // delete_location actions land here. We patch the draft when this
  // is a pre-launch session (no live tenant row yet) AND PATCH the
  // live tenant when the store is already launched. Either path
  // surfaces a conversational confirmation so the AI can't fall back
  // to "tim bisa..." deflection language.

  async function applyTenantSetting(
    key: string,
    value: string | number | boolean | null,
  ): Promise<ActionResult> {
    // Driven by the registry so adding a setting in
    // src/lib/tenant-settings/registry.ts auto-extends the AI's
    // mutation surface here without editing this whitelist.
    const ALLOWED = new Set(settingKeys());
    if (!ALLOWED.has(key)) {
      return fail('update_tenant_setting', {
        error_code: 'SETTING_NOT_ALLOWED',
        error_human: 'Setelan itu belum bisa aku ubah dari sini. Coba sebut setelan lain.',
        suggestion: `valid keys: ${Array.from(ALLOWED).join(', ')}`,
        debug: { key, value },
      });
    }
    const isLaunched = !!draft.slug && draft.menu_categories?.some((c) => c.items.length > 0);
    if (!isLaunched) {
      // Pre-launch: settings will materialize on launch. Treat as ok
      // so the AI doesn't apologize, but include the deferral hint so
      // the next-turn AI knows the value isn't live yet.
      return ok('update_tenant_setting', `setelan ${key}=${String(value)} dicatat (akan dipakai saat launch)`);
    }
    try {
      const res = await fetch('/api/admin/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Gagal simpan setelan');
      }
      return ok('update_tenant_setting', `setelan ${key} diubah ke ${String(value)}`);
    } catch (err) {
      return fail('update_tenant_setting', {
        error_code: 'SETTING_PATCH_FAILED',
        error_human: 'Gagal simpan setelan. Coba lagi sebentar lagi.',
        debug: { key, value, message: (err as Error).message },
      });
    }
  }

  async function applyAddLocation(
    name: string,
    address?: string,
    phone?: string,
    code?: string,
  ): Promise<ActionResult> {
    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, phone, code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Gagal tambah cabang');
      return ok('add_location', `cabang "${name}" ditambahkan`, body?.location);
    } catch (err) {
      return fail('add_location', {
        error_code: 'ADD_LOCATION_FAILED',
        error_human: `Gagal tambah cabang: ${(err as Error).message}`,
        debug: { name, message: (err as Error).message },
      });
    }
  }

  async function applyUpdateLocation(
    locationId: string,
    fields: { name?: string; address?: string; phone?: string; is_active?: boolean },
  ): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/admin/locations/${encodeURIComponent(locationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Gagal update cabang');
      return ok(
        'update_location',
        `cabang diperbarui (${Object.keys(fields).join(', ')})`,
      );
    } catch (err) {
      return fail('update_location', {
        error_code: 'UPDATE_LOCATION_FAILED',
        error_human: `Gagal update cabang: ${(err as Error).message}`,
        debug: { location_id: locationId, message: (err as Error).message },
      });
    }
  }

  async function applyAddDeliveryZone(
    name: string,
    feeCents: number,
    radiusKm?: number,
  ): Promise<ActionResult> {
    try {
      const res = await fetch('/api/admin/delivery-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, fee_cents: feeCents, radius_km: radiusKm ?? null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Gagal tambah zone');
      const fee = (feeCents / 100).toLocaleString('id-ID');
      return ok(
        'add_delivery_zone',
        `zone "${name}" aktif${radiusKm ? `, radius ${radiusKm}km` : ''}, ongkir Rp ${fee}`,
        body?.zone,
      );
    } catch (err) {
      return fail('add_delivery_zone', {
        error_code: 'ADD_ZONE_FAILED',
        error_human: `Gagal tambah zone delivery: ${(err as Error).message}`,
        debug: { name, message: (err as Error).message },
      });
    }
  }

  async function applyUpdateDeliveryZone(
    zoneId: string,
    fields: { name?: string; fee_cents?: number; radius_km?: number | null; is_active?: boolean },
  ): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/admin/delivery-zones/${encodeURIComponent(zoneId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Gagal update zone');
      return ok('update_delivery_zone', `zone diperbarui`, body?.zone);
    } catch (err) {
      return fail('update_delivery_zone', {
        error_code: 'UPDATE_ZONE_FAILED',
        error_human: `Gagal update zone delivery: ${(err as Error).message}`,
        debug: { zone_id: zoneId, message: (err as Error).message },
      });
    }
  }

  async function applyDeleteDeliveryZone(zoneId: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/admin/delivery-zones/${encodeURIComponent(zoneId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Gagal hapus zone');
      }
      return ok('delete_delivery_zone', 'zone dihapus');
    } catch (err) {
      return fail('delete_delivery_zone', {
        error_code: 'DELETE_ZONE_FAILED',
        error_human: `Gagal hapus zone delivery: ${(err as Error).message}`,
        debug: { zone_id: zoneId, message: (err as Error).message },
      });
    }
  }

  async function applyTogglePaymentMethod(
    method: string,
    enabled: boolean,
    config?: Record<string, unknown>,
  ): Promise<ActionResult> {
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, is_enabled: enabled, config }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        return ok(
          'toggle_payment_method',
          `metode ${method} ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`,
          body?.method,
        );
      }
      // Safety-gate refusal — silently log demand to roadmap_requests
      // so /admin/roadmap shows aggregate interest, then surface the
      // friendly "belum siap" copy. This is the same pattern the
      // third response pattern uses.
      if (body?.code === 'DIGITAL_PAYMENTS_DISABLED') {
        try {
          await applyLogRoadmapRequest(
            'integrations',
            'Per-toko Xendit lagi disiapkan; pakai cashier dulu.',
            lastUserMessageRef.current || `aktifkan ${method}`,
          );
        } catch {
          /* roadmap log is best-effort — never fail the parent toggle on it */
        }
        return fail('toggle_payment_method', {
          error_code: 'DIGITAL_PAYMENTS_DISABLED',
          error_human:
            'Pembayaran digital belum siap di Sajian — masih nunggu integrasi per-toko sama Xendit. Cashier dulu ya, nanti aku kabarin pas siap.',
          suggestion:
            'cashier flow remains available; gate flips after per-tenant Xendit lands',
          debug: { method, enabled },
        });
      }
      throw new Error(body?.error ?? 'Gagal toggle metode pembayaran');
    } catch (err) {
      return fail('toggle_payment_method', {
        error_code: 'TOGGLE_PAYMENT_FAILED',
        error_human: `Gagal toggle pembayaran ${method}: ${(err as Error).message}`,
        debug: { method, enabled, message: (err as Error).message },
      });
    }
  }

  async function applyLogRoadmapRequest(
    category: string,
    workaroundOffered: string,
    rawUserMessage?: string,
  ): Promise<ActionResult> {
    const message = (rawUserMessage ?? lastUserMessageRef.current ?? '').trim();
    if (!message) {
      return fail('log_roadmap_request', {
        error_code: 'NO_USER_MESSAGE',
        error_human: 'Aku gak punya konteks request ini.',
        suggestion: 'panggil log_roadmap_request hanya setelah user kasih message konkret',
      });
    }
    try {
      const res = await fetch('/api/admin/roadmap-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          workaround_offered: workaroundOffered,
          raw_user_message: message,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Gagal catat request');
      return ok(
        'log_roadmap_request',
        `request kategori "${category}" tercatat (${body?.mode ?? 'created'})`,
        body?.request,
      );
    } catch (err) {
      return fail('log_roadmap_request', {
        error_code: 'LOG_ROADMAP_FAILED',
        error_human: 'Permintaannya udah aku catat ya, tim akan triage. Sementara, coba pendekatan workaround di atas.',
        debug: { category, message: (err as Error).message },
      });
    }
  }

  async function applyRequestCustomDomain(domain: string): Promise<ActionResult> {
    try {
      const res = await fetch('/api/admin/custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Gagal daftar domain');
      const dns = body?.dns_instructions;
      const summary = dns
        ? `domain ${domain} terdaftar; tambahkan CNAME ${dns.cname.host} → ${dns.cname.target} dan TXT ${dns.txt.host}=${dns.txt.value} di DNS provider`
        : `domain ${domain} terdaftar`;
      return ok('request_custom_domain', summary, body?.domain);
    } catch (err) {
      return fail('request_custom_domain', {
        error_code: 'REGISTER_DOMAIN_FAILED',
        error_human: `Gagal daftarkan domain: ${(err as Error).message}`,
        debug: { domain, message: (err as Error).message },
      });
    }
  }

  async function applyDeleteLocation(locationId: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/admin/locations/${encodeURIComponent(locationId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Gagal hapus cabang');
      }
      return ok('delete_location', 'cabang dihapus');
    } catch (err) {
      return fail('delete_location', {
        error_code: 'DELETE_LOCATION_FAILED',
        error_human: `Gagal hapus cabang: ${(err as Error).message}`,
        debug: { location_id: locationId, message: (err as Error).message },
      });
    }
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
    lastUserMessageRef.current = userMsg.content;
    await pushMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg]
        .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          draft,
          // Read-back loop: previous turn's outcomes feed the next
          // system prompt. Strip debug fields client-side — server
          // never sees them, so a misbehaving prompt can't paste
          // raw IDs into chat. Only ok/action/summary/error_human/
          // error_code/suggestion are forwarded.
          recent_action_results: recentActionResultsRef.current.map((r) =>
            r.ok
              ? { ok: true, action: r.action, summary: r.summary }
              : {
                  ok: false,
                  action: r.action,
                  error_code: r.error_code,
                  error_human: r.error_human,
                  suggestion: r.suggestion,
                },
          ),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal menghubungi AI');

      await pushMessage({ role: 'assistant', content: body.message, kind: 'text' });
      const actions: OnboardingAction[] = Array.isArray(body.actions)
        ? body.actions
        : body.action
          ? [body.action]
          : [];
      const turnResults: ActionResult[] = [];
      for (const a of actions) {
        const result = await applyAction(a);
        turnResults.push(result);
      }

      // Ring buffer — keep only the most recent results so prompts
      // don't bloat across long conversations.
      const merged = [...recentActionResultsRef.current, ...turnResults];
      recentActionResultsRef.current = merged.slice(Math.max(0, merged.length - 6));

      // Surface every failure inline so the user sees the truth even
      // if the AI's natural-language reply was optimistic. Multiple
      // failures collapse into one bubble. Only error_human is
      // surfaced — debug + error_code stay in console.error / Sentry.
      const failures = turnResults.filter(
        (r): r is Extract<ActionResult, { ok: false }> => !r.ok,
      );
      if (failures.length > 0) {
        for (const f of failures) {
          // eslint-disable-next-line no-console
          console.error('[chat] action failed', {
            action: f.action,
            error_code: f.error_code,
            debug: f.debug,
          });
        }
        const lines = failures.map((f) => `• ${f.error_human}`);
        await pushMessage({
          role: 'assistant',
          content:
            failures.length === 1
              ? lines[0]
              : `Beberapa permintaan gagal:\n${lines.join('\n')}`,
          kind: 'text',
        });
      }
    } catch (e) {
      const err = e as Error;
      const message = err.message ?? '';
      const lower = message.toLowerCase();
      // Categorize the chat-flow failure so the user sees something
      // concrete instead of "ada kendala sebentar".
      let copy = `Chat gagal: ${message}. Coba kirim lagi.`;
      if (lower.includes('rate limit') || lower.includes('429') || lower.includes('terlalu banyak')) {
        copy = 'Terlalu banyak permintaan. Tunggu ~30 detik lalu coba lagi.';
      } else if (lower.includes('timeout') || lower.includes('aborted')) {
        copy = 'AI lagi lambat (timeout). Coba lagi sebentar lagi.';
      } else if (lower.includes('codegen_disabled')) {
        copy = 'Mode lanjutan belum aktif untuk toko ini. Aktifkan dari Pengaturan dulu.';
      } else if (lower.includes('unauthorized') || lower.includes('401')) {
        copy = 'Sesi kamu kadaluarsa. Refresh halaman lalu masuk lagi.';
      } else if (lower.includes('failed to fetch') || lower.includes('network')) {
        copy = 'Koneksi terputus. Cek internet kamu lalu coba lagi.';
      }
      console.error('[chat] send failed', { message, stack: err.stack });
      await pushMessage({ role: 'assistant', content: copy, kind: 'text' });
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
        // Surface the server's specific error to the owner. The route
        // returns Indonesian copy + an error_code we log for debug.
        // Without this bubble the owner saw the same generic "Gagal
        // baca menu" for every distinct failure mode (PDF too big,
        // timeout, no_categories, preprocess fail). Now they see the
        // actual cause + an actionable next step.
        console.error('[extract-menu] failed', {
          status: res.status,
          error_code: body.error_code,
          failed_pages: body.failed_pages,
          pages_total: body.pages_total,
        });
        await pushMessage({
          role: 'assistant',
          content: body.error ?? 'Gagal baca menu — coba foto yang lebih jelas atau pisah jadi beberapa file.',
          kind: 'text',
        });
        return;
      }

      const cats: CategoryDraft[] = body.categories ?? [];
      await setMenu(cats);

      const itemCount = cats.reduce((n, c) => n + c.items.length, 0);
      // Partial-success path: server returns body.notes when some
      // pages parsed and others didn't ("12 dari 20 halaman terbaca.
      // Halaman gagal: hal 3, hal 7."). Show the owner exactly what
      // they got + what to retry, not a flat success.
      const partialNote = (body.notes as string | undefined)?.trim();
      const successContent = partialNote
        ? `Aku berhasil baca ${itemCount} item dari ${cats.length} kategori. ${partialNote}`
        : `Aku berhasil baca ${itemCount} item dari ${cats.length} kategori. Cek di bawah — klik di nama atau harga buat ubah, atau bilang aja ke aku!`;
      await pushMessage({
        role: 'assistant',
        content: successContent,
        kind: 'menu_extracted',
      });
    } catch (e) {
      console.error('[menu] extraction failed (network/parse)', e);
      // Network or JSON parse failure — server error didn't reach us.
      // Show the thrown error message verbatim instead of swallowing it
      // into a generic string.
      const detail = (e as Error).message?.trim();
      await pushMessage({
        role: 'assistant',
        content: detail
          ? `Gagal baca menu: ${detail}. Coba lagi sebentar lagi.`
          : 'Gagal baca menu. Coba foto yang lebih jelas atau kirim per halaman.',
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
      <div className="ob-panel__topbar">
        <Link href="/setup/history" className="ob-panel__history-link">
          Riwayat perubahan →
        </Link>
      </div>
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
