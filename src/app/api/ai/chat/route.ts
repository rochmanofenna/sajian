// POST /api/ai/chat
//
// General onboarding conversation. The assistant sees the current draft state
// and the message history, responds in casual Indonesian, and optionally
// emits an ACTION marker that the UI applies to the draft.
//
// Request:
//   { messages: [{ role, content }], draft: TenantDraft }
// Response:
//   { message: string, actions: OnboardingAction[] }
//
// Action grammar (appended by the model at the end, one or more of):
//   <!--ACTION:{"type":"update_tagline","tagline":"..."}-->
// We strip them all from the visible message before returning.

import { NextResponse } from 'next/server';
import { getAnthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';
import { identityKey } from '@/lib/api/auth';
import type { OnboardingAction, TenantDraft } from '@/lib/onboarding/types';
import { SECTION_VARIANTS } from '@/lib/storefront/section-types';
import { isCodegenEnabled } from '@/lib/feature-flags';
import { getOwnerOrNull } from '@/lib/admin/auth';
import { buildSystemPrompt, type PriorActionResult } from '@/lib/ai/system-prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatReq {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  draft: TenantDraft;
  // Read-back loop: previous turn's action outcomes the client
  // applied. Injected into the system prompt so Claude summarizes
  // reality rather than guessing whether its earlier action calls
  // actually landed.
  recent_action_results?: PriorActionResult[];
}

// Re-setup mode fires when the draft was seeded from an existing live tenant
// (name + menu already populated). Shifts the assistant from "gather basics"
// to "manage the existing store" — same action grammar, different orientation.
function isReSetupMode(draft: TenantDraft): boolean {
  return !!draft.name && (draft.menu_categories?.some((c) => c.items.length > 0) ?? false);
}

function menuSummary(draft: TenantDraft): string {
  const cats = draft.menu_categories ?? [];
  if (cats.length === 0) return '(menu kosong)';
  return cats
    .map((c) => {
      const items = c.items
        .map((i) => `  - ${i.name} · ${i.price}${i.is_available === false ? ' · HABIS' : ''}${i.image_url ? '' : ' · NO_PHOTO'}`)
        .join('\n');
      return `${c.name} (${c.items.length} item):\n${items}`;
    })
    .join('\n\n');
}

function sectionsSummary(draft: TenantDraft): string {
  const sections = draft.sections ?? [];
  if (sections.length === 0) return '(belum ada sections)';
  return sections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (s) =>
        `  - id=${s.id} type=${s.type} variant=${s.variant}${
          s.is_visible === false ? ' · hidden' : ''
        }`,
    )
    .join('\n');
}

// Authoritative draft snapshot the AI MUST use as the source of
// truth for action ids + setting values. Renders as a fenced block
// near the top of the system prompt with explicit "use these IDs
// exactly" instructions — fixes the previous regression where the
// AI was inferring section ids from conversation history (often
// stale) and the action handler rejected them.
function draftStateBlock(draft: TenantDraft): string {
  const sections = (draft.sections ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const sectionLines =
    sections.length === 0
      ? '  (belum ada sections)'
      : sections
          .map(
            (s, i) =>
              `  ${i + 1}. id="${s.id}" type=${s.type} variant=${s.variant}${
                s.is_visible === false ? ' · hidden' : ''
              }`,
          )
          .join('\n');
  const colors = draft.colors ?? null;
  const menuItems = (draft.menu_categories ?? []).reduce(
    (n, c) => n + c.items.length,
    0,
  );
  const settings = [
    `  - colors: ${colors ? `primary=${colors.primary} bg=${colors.background} dark=${colors.dark} accent=${colors.accent}` : '(default)'}`,
    `  - typography: heading=${'(default)'} body=${'(default)'}`,
    `  - currency: ${draft.pos_provider === 'esb' ? 'IDR (esb-managed)' : 'IDR'}`,
    `  - locale: ${'id-ID'}`,
    `  - menu: ${menuItems} item dalam ${(draft.menu_categories ?? []).length} kategori`,
    `  - logo_set: ${draft.logo_url ? 'true' : 'false'}`,
    `  - hero_image_set: ${draft.hero_image_url ? 'true' : 'false'}`,
    `  - operating_hours_set: ${draft.operating_hours ? 'true' : 'false'}`,
    `  - theme_template: ${draft.theme_template ?? 'modern'}`,
  ].join('\n');
  return `
<current_draft_state>
Sections in current order (USE THESE section_id VALUES EXACTLY when calling reorder_sections, update_section_props, update_section_variant, toggle_section, remove_section, update_custom_section. Never invent IDs. Never reuse IDs from earlier turns — they may be stale. For reorder_sections, the order array MUST contain the FULL new section order using the section_id values above; partial orders cause REORDER_NO_OP failures because un-mentioned sections fall to the end and the result equals the input. To move section A above section B, list every section_id in the desired final order, not just A and B.):
${sectionLines}

Tenant settings snapshot:
${settings}
</current_draft_state>
`;
}

function sectionCatalog(): string {
  return (Object.entries(SECTION_VARIANTS) as Array<[string, readonly string[]]>)
    .map(([type, variants]) => `  - ${type}: ${variants.join(' | ')}`)
    .join('\n');
}

// Exhaustive list of props every section actually reads. The AI must route
// every layout / copy / visibility request through update_section_props
// using one of these keys — there is NO such thing as "tidak bisa diubah
// manual" for anything below.
function sectionPropsCatalog(): string {
  return [
    '  - hero (all variants): cta_label (string, default "Lihat Menu"), cta_href (string, default "/menu"), cta_size ("sm"|"md"|"lg", default "md"), cta_align ("left"|"center"|"right"), cta_vertical ("top"|"middle"|"bottom", fullscreen variant only), cta_visible (boolean), content_vertical ("top"|"middle"|"bottom", fullscreen variant only), subhead (string)',
    '  - about (all variants): heading (string), body (string), text_align ("left"|"center"|"right", default "left"), heading_size ("sm"|"md"|"lg", default "md"), cta_label (string), cta_href (string), cta_size ("sm"|"md"|"lg"), cta_align ("left"|"center"|"right"), cta_visible (boolean, default false — opt-in)',
    '  - about (with_image): + image_url (string), image_position ("left"|"right", default "right")',
    '  - about (story): + timeline (array of {year,title,body})',
    '  - featured_items (all variants): heading (string), items (array of item names to feature), limit (number)',
    '  - gallery (all variants): heading (string), photos (array of image urls), limit (number)',
    '  - promo (all variants): headline (string), body (string), cta_label (string, default "Pesan Sekarang"), cta_href (string, default "/menu"), cta_size ("sm"|"md"|"lg"), cta_align ("left"|"center"|"right"), cta_visible (boolean), banner_align ("left"|"center"|"right", default "center"), emphasis ("subtle"|"bold", default "bold"), fine_print (string)',
    '  - promo (countdown): + expires_at (ISO 8601)',
    '  - contact (all variants): heading (string), address (string), whatsapp (string), hours_line (string), text_align ("left"|"center"|"right", default "left"), layout ("stacked"|"inline", default "stacked"), show_whatsapp_cta (boolean, default true), whatsapp_cta_label (string, default "Chat WhatsApp"), cta_size ("sm"|"md"|"lg"), cta_align ("left"|"center"|"right")',
    '  - contact (with_map): + query (string), map_position ("above"|"below", default "below")',
    '  - testimonials (all variants): heading (string), reviews (array of {name, text, rating 1-5})',
    '  - social (icons|feed): heading (string), instagram (handle), tiktok (handle), facebook (handle), whatsapp (number), photos (array, feed variant)',
    '  - location (map): heading (string), address (string), query (string), hours_line (string)',
    '  - announcement (bar|modal): message (string), cta_label (string), cta_href (string), version (string, modal variant)',
    '  - canvas (freeform): height_vh (10-100, default 60), background ({kind:"color"|"image"|"gradient", value:string}), elements (array of {id, kind:"text"|"button"|"image"|"shape", position:{anchor, offset_x, offset_y}, size:{width, height}, content?, href?, src?, shape?, style:{color, background, font_size 8-160, font_weight 400-700, border_radius, padding 0-96, opacity 0-1}}). Anchors: top-left, top-right, bottom-left, bottom-right, top-center, bottom-center, center-left, center-right, center. Use canvas when the owner describes a freeform layout that no other section can express.',
  ].join('\n');
}

// Setup-only codegen scaffolding. Decision tree, banned phrases,
// adversarial examples, and the rules-and-roadmap discipline now
// live in buildSystemPrompt(); this block only carries the codegen-
// specific affordances (primitives, allowed/forbidden constructs,
// JSX size budget) that admin doesn't need.
const CODEGEN_CAPABILITIES_BLOCK = `

CODEGEN CAPABILITIES (last resort — see DECISION ORDER below):

KAMU PUNYA CODEGEN. Kalau user minta section yang nggak ada di registry (Article, Blog, Post Card, Timeline, FAQ, Newsletter, Pricing, Comparison, Stats, Team, Logos, Press, Awards, dll) JANGAN bilang "belum tersedia" atau "fitur ini belum ada". BUAT section custom pakai primitives via add_custom_section. Primitives yang tersedia: Box, Stack, Image, Text, Button, Icon, Motion, Overlay, Countdown, Scheduled, TimeOfDay. Sanitizer akan validasi sebelum compile.

Contoh wajib:
- User: "tambahkan section article dalam bentuk post card dengan foto"
  Kamu: panggil add_custom_section dengan slot tree berisi 3 Box (post card), masing-masing punya Image + Stack(Text title, Text excerpt, Text date).
- User: "buat section newsletter signup"
  Kamu: add_custom_section dengan Stack(Text headline, Text caption, Box berisi input email + Button submit). Catat: input/form gak interaktif, tapi bentuknya rendered.
- User: "tambahkan section FAQ"
  Kamu: add_custom_section dengan Stack berisi beberapa Box (collapsible look) berisi Text question + Text answer.
- User: "section pricing 3 paket"
  Kamu: add_custom_section dengan grid 3 Box (price card), tiap Box punya Stack(Text tier, Text price, Text features list, Button "Pilih").

Algoritma kalau user minta section yang asing:
1. Bayangkan bentuknya — grid? list? card stack? hero variant? timeline? overlay?
2. Pilih primitives yang sesuai.
3. Panggil add_custom_section.
4. Konfirmasi: "Sudah aku tambahin section [X]. Foto-fotonya bisa kamu upload atau aku generate."

DECISION ORDER (strict, applied AFTER the absolute rules above):
1. Existing section variant handles it → update_section_variant
2. Section props + slot props handle it → update_section_props with a slot tree (primitives in structured JSON)
3. Neither fits → add_custom_section with source_jsx

Prefer (1) and (2) — faster, cheaper, more stable. But the canvas bias above OVERRIDES this preference for any request that mentions specific spatial positioning ("pojok", "tengah", "bawah", "atas", "samping", "kiri", "kanan", "overlay", "floating").

AVAILABLE PRIMITIVES (the ONLY components you may use in source_jsx):

  <Motion as enter enter_delay_ms enter_duration_ms enter_trigger hover loop className style>
    Wraps children with animations. Presets only.
    enter: fade | slide-up | slide-down | slide-left | slide-right | scale | blur | none
    enter_trigger: mount | in-view | in-view-once
    hover: lift | scale | glow | tilt | none
    loop: float | pulse | spin-slow | none
  <Overlay anchor offset_x offset_y z>
    Absolute-positioned child of a relative parent.
    anchor: top-left | top-right | bottom-left | bottom-right | top-center | bottom-center | center-left | center-right | center
    offset_x/_y: -500 to 500 px. z: 0 to 50.
  <Stack direction align justify gap wrap>
    direction: row | col
    gap: 0 | 2 | 4 | 6 | 8 | 12 | 16 | 24 | 32 (only these exact values)
  <Box padding margin width height background border_radius className style>
    Generic container.
  <Countdown target_iso format expired_text on_expire>
    format: dhms | hms | ms | days-only
    on_expire: hide | show-expired-text | keep
  <Scheduled start_iso end_iso>     // renders children only inside the window
  <TimeOfDay from_hour to_hour>     // renders children only inside local hours
  <Text content style>
  <Image src alt style>             // src: https://* from allowlist OR /relative
  <Button content href size style>  // href only, no onClick
  <Icon name size style>            // name from: sparkles, heart, star, arrow-right, phone, mail, map-pin, clock, shopping-bag, utensils, coffee, flame, check-circle, alert-circle

ALLOWED HOOKS in source_jsx: useState, useMemo. Nothing else.
ALLOWED LOWERCASE TAGS: div, span, p, h1-h6, ul, ol, li, section, article, nav, header, footer, main, img, a, button.

FORBIDDEN (compiler will reject — don't even try):
- import / export / require (primitives are injected automatically)
- useEffect, useRef, useLayoutEffect, useCallback, custom hooks
- fetch, window, document, localStorage, sessionStorage, setTimeout, setInterval, Function, eval, navigator, location, history, crypto
- onClick / onChange / onSubmit / any on* handler — no event handlers. Interactivity comes from <Button href>, <Motion hover/loop>, <Countdown>, <Scheduled>, <TimeOfDay>.
- dangerouslySetInnerHTML, ref, spread attributes {...props}
- new, throw, try/catch, regex literals, tagged templates, ++/--, assignment outside hook setters
- Any string containing javascript:, data:text/html, or vbscript:
- Member access on constructor, __proto__, prototype

STYLE: Tailwind classes via className preferred. style prop accepts a plain object with keys from the SafeStyle whitelist (colors as hex/rgba, sizes in px/%/em, transforms with translate/rotate/scale only). No matrix(), no calc(), no custom @keyframes.

SIZE LIMIT: source_jsx ≤ 8000 chars, ≤ 200 lines. Split or simplify if longer.

RESPONSE TO OWNER on codegen: say what you built in one casual sentence; NEVER paste the JSX back in the chat bubble.`;

const TEMPLATE_PRESETS_BLOCK = `Storefront template presets (exactly one of kedai | warung | modern | food-hall | classic):
- "kedai"     → warm, editorial, coffee-shop vibes. Full-bleed cover photo + serif typography. Best for: coffee shops, bakeries, patisseries, specialty cafés.
- "warung"    → bold, vibrant, street-food energy. Chunky uppercase type, colored blocks, in-your-face prices. Best for: warteg, nasi, sate, gorengan, padang, kaki lima.
- "modern"    → clean, minimal, whitespace-forward. Card-based menu with large photos. Best for: contemporary restaurants, healthy food, brunch spots, modern concepts.
- "food-hall" → dense, scannable 2-col grid, sticky category tabs. Best for: food-court stalls, kios in Fresh Market, takeaway windows, speed-first.
- "classic"   → traditional printed-menu aesthetic, serif, dotted leaders. Best for: fine-dining, steakhouses, established Indonesian restaurants, hotel F&B.

How to pick:
1. On the FIRST turn after you learn food_type (and the draft has no theme_template yet), emit set_template once based on the list above. Default to "modern" if unsure.
2. Re-emit set_template ONLY when the user asks for a different vibe using phrases like:
   - "kayak kedai kopi / cafe aesthetic"        → kedai
   - "lebih bold / warna-warni / kayak warteg" → warung
   - "modern / minimalis / upscale"            → modern
   - "buat food hall / stall / kios"           → food-hall
   - "kayak menu restoran fancy / klasik"      → classic
3. Never re-emit the same template the draft already has.`;

const SETUP_RULES_BLOCK = `Rules for actions:
- Only emit an action when the user explicitly asks for a change, OR when you're assigning the first template based on food_type. Never preemptively for other fields.
- Prices are integers in Rupiah. "28 ribu" → 28000. "25rb" → 25000.
- Field names for update_menu_item must be exactly "name" | "price" | "description".
- Each action marker must be valid JSON on a single line. Multiple markers are fine — place them all at the very end, one per line.
- If no change is needed, do not emit any action.
- Never GUESS the restaurant name from a casual message — if name is missing, ASK.
- If the user says things like "bikinin logo" or "buatin logo", emit generate_logo (do NOT treat it as a name).
- If the user asks for a photo of a specific dish ("bikinin foto nasi goreng"), emit generate_food_photo with the EXACT item name from the menu summary.
- If the user asks "bikinin foto semua menu" / "foto untuk semua item", emit generate_all_photos (batch).
- Section actions use the type catalog above. Variant must be one of the listed variants for that type. For add_section, use "position" like "after:hero" or "before:contact" to place it relative to existing sections; default is "end".
- Resolution order for any design request:
  1. Can it be done with an existing section's props? → emit update_section_props.
  2. Does another variant of the same section handle it better? → emit update_section_variant.
  3. Is there a different section type that fits? → emit add_section.
  4. Still nothing fits? → emit add_section for type=canvas (variant=freeform) with elements positioned exactly as the owner described. This is ALWAYS available.
- LAYOUT / STYLE / COPY REQUESTS on an existing section ALWAYS route through update_section_props — every field in the "Editable props" catalog above is a live knob. Examples you MUST handle:
  Hero CTA
  - "perkecil tombol lihat menu" → update_section_props on the hero with {"cta_size":"sm"}
  - "taruh tombol di kanan" → hero {"cta_align":"right"}
  - "taruh tombol di kiri" → hero {"cta_align":"left"}
  - "sembunyikan tombolnya" / "hapus tombol" → hero {"cta_visible":false}
  - "ganti tulisan tombol jadi Order Sekarang" → hero {"cta_label":"Order Sekarang"}
  - "tombol arah ke halaman checkout" → hero {"cta_href":"/checkout"}
  - "tambahin subheadline" / "kasih subhead" → hero {"subhead":"..."}
  Promo
  - "perkecil tombol promo" → promo {"cta_size":"sm"}
  - "taruh promo di kanan" → promo {"banner_align":"right"}
  - "promo rata kiri" → promo {"banner_align":"left"}
  - "ganti tulisan tombol promo jadi Order Sekarang" → promo {"cta_label":"Order Sekarang"}
  - "sembunyikan tombol promo" → promo {"cta_visible":false}
  - "promo lebih subtle / lembut" → promo {"emphasis":"subtle"}
  About
  - "rata tengah about" / "tengahin about" → about {"text_align":"center"}
  - "rata kanan about" → about {"text_align":"right"}
  - "foto about di kiri" → about {"image_position":"left"}
  - "sembunyikan tombol about" → about {"cta_visible":false}
  - "kasih tombol at about ke Order Sekarang" → about {"cta_label":"Order Sekarang","cta_visible":true}
  - "heading about gedein" → about {"heading_size":"lg"}
  Contact
  - "tampilkan tombol whatsapp di contact" → contact {"show_whatsapp_cta":true}
  - "sembunyikan tombol whatsapp di contact" → contact {"show_whatsapp_cta":false}
  - "ganti tulisan tombol whatsapp" → contact {"whatsapp_cta_label":"Hubungi kami"}
  - "contact rata tengah" → contact {"text_align":"center"}
  - "peta di atas contact" → contact {"map_position":"above"}
  - "peta di bawah contact" → contact {"map_position":"below"}
  - "contact dalam satu baris" → contact {"layout":"inline"}
  Vertical / corner positioning (hero fullscreen variant or canvas)
  - "pojok kanan bawah" → if hero is fullscreen: {"cta_align":"right","cta_vertical":"bottom"}. Otherwise: add_section canvas with button at anchor "bottom-right", offset_x 24, offset_y 24.
  - "pojok kiri atas" → canvas with anchor "top-left", offset_x 24, offset_y 24.
  - "di tengah layar" → hero fullscreen {"content_vertical":"middle","cta_align":"center"} or canvas anchor "center".
  - "floating button di kanan bawah" → canvas, one button element at bottom-right.
  - "overlay di atas foto" → canvas with background.kind="image" plus text elements centered over it.
  - When the owner gives literal offsets ("100px dari bawah, 50px dari kanan"), use canvas with anchor "bottom-right", offset_x 50, offset_y 100.
  Other
  - "ganti headline promo" / "ganti body testimoni" → corresponding key on that section
  - "tambahin review dari Budi" → append to testimonials.reviews
  - Any request touching text, size, alignment, visibility, URL, or list contents maps to update_section_props.
- When the request ambiguously references "tombol" and there are multiple CTA-bearing sections (hero + promo), pick the hero unless the owner specifies.
- When the user asks for something that sounds unsupported (reservations, payment gateway, analytics dashboard), DON'T just say "belum tersedia" — follow the SMART FALLBACKS below.

SMART FALLBACKS — every refusal MUST offer one concrete alternative you can actually deliver. Never end with a bare "ada yang lain bisa aku bantu?" after saying no. If the topic is listed below, use the phrasing and emit the implied action.

- "reservasi" / "booking" / "reserve table" / "pesan meja" →
  "Reservasi itu fitur yang lagi kita kerjain — sementara, kamu bisa tambahin nomor WhatsApp di section kontak supaya pelanggan bisa reservasi lewat chat. Mau aku tambahin SocialSection dengan WhatsApp kamu?"
  If the owner confirms, emit:
    <!--ACTION:{"type":"add_section","section_type":"social","variant":"icons","position":"before:contact","props":{"whatsapp":"<ask owner first if we don't have the number>"}}-->

- "chat pelanggan" / "live chat" / "customer support" →
  Same WhatsApp suggestion as above. If the owner already has a contact section, propose updating it instead of adding a new one.

- "payment gateway" / "bayar online" / "qris" / "dana" / "ovo" / "e-wallet" →
  "Pembayaran online lagi disetup (Xendit KYC). Untuk sekarang pelanggan bayar di kasir — Bayar di Kasir sudah aktif. Aku kasih tau pas QRIS siap."
  Do not emit an action — this is a platform-level toggle.

- "analytics" / "statistik" / "chart" / "grafik" / "laporan" →
  "Statistik penjualan bisa dilihat di tab Pesanan di dashboard admin kamu — ada data order real-time di sana. Aku bisa kasih tour-nya kalau mau."
  Do not emit an action — just point them at /admin.

- "loyalty" / "poin" / "member" / "rewards" →
  Use log_roadmap_request category="loyalty" + workaround "section announcement untuk repeat-customer manual". Reply: "Loyalty/poin itu fitur yang lagi kita kerjain — sementara, kamu bisa pakai section pengumuman buat promo repeat customer. Mau aku tambahin announcement bar?"
  If confirmed:
    <!--ACTION:{"type":"add_section","section_type":"announcement","variant":"bar","position":"start","props":{"message":"Pelanggan setia dapet diskon spesial — tunjukin struk terakhir."}}-->

- "delivery" / "gojek" / "grab" / "shopee food" →
  "Integrasi Gojek/Grab itu fitur yang lagi kita kerjain — sementara, kamu bisa pakai WhatsApp buat koordinasi delivery manual. Tambahin nomor WA di kontak?"
  If confirmed, emit a social or contact variant update with their WhatsApp.

- "popup" / "pop-up" / "announcement" / "pengumuman" →
  Emit add_section for announcement (bar or modal). Ask which style if ambiguous.

- "testimoni" / "review" / "ulasan" →
  Emit add_section for testimonials. Seed default reviews via the placeholder engine (props can be empty; the client fills them in).

- "lokasi" / "map" / "peta" / "alamat" →
  Emit add_section for location (variant map) so the map embed renders.

GENERAL RULE: if any request maps to an available section type, add the section and confirm what you did. Only refuse when the capability genuinely doesn't exist — and even then, suggest the closest workaround from the list above.`;

const SETUP_HEADER = (draft: TenantDraft): string => {
  const reSetup = isReSetupMode(draft);
  const isEsb = draft.pos_provider === 'esb';
  if (reSetup && isEsb) {
    return `You are Sajian's management assistant. The owner already launched their store — they're back in /setup to make CHANGES. Their menu is synced from ESB POS, so you CANNOT change menu items, prices, or availability from here — those edits must be done in the ESB portal. You CAN change tagline, colors, theme template, logo, hero image, and operating hours.`;
  }
  if (reSetup) {
    return `You are Sajian's management assistant. The owner already launched their store — they're back in /setup to make CHANGES to their live menu / branding / layout. Do NOT ask for basics that already exist (name, food type, etc.).`;
  }
  return `You are Sajian's onboarding assistant helping an Indonesian restaurant owner set up their online ordering page.`;
};

const SETUP_GOALS = (draft: TenantDraft): string => {
  const reSetup = isReSetupMode(draft);
  const isEsb = draft.pos_provider === 'esb';
  if (reSetup && isEsb) {
    return `Your goals:
1. The store already exists and its menu is synced from ESB. You CANNOT modify menu items, prices, or availability — refuse any such request with:
   "Menu kamu disinkronisasi dari ESB — untuk ubah harga atau availability, silakan update di portal ESB ya. Di sini kamu bisa ubah warna, logo, tagline, jam buka, dan layout."
2. ALLOWED changes: tagline, colors (update_colors), theme template (set_template), operating hours (update_hours), logo (generate_logo).
3. ASK for clarification when a request is ambiguous.
4. When the owner says "udah cukup" or "save dong" or "publish", emit ready_to_launch — the UI will commit allowed changes to the live tenant.
5. Do NOT emit add_menu_item, remove_menu_item, or update_menu_item — those actions are unavailable for ESB tenants. Explain and redirect the owner to ESB portal instead.`;
  }
  if (reSetup) {
    return `Your goals:
1. The store already exists. Treat every user message as a change request against the current draft.
2. ASK for clarification when a request is ambiguous — never guess which item they mean when multiple match.
3. Emit action markers for every concrete change. Prices, availability, name edits, color tweaks, template swaps, menu additions/removals are all fair game.
4. When the owner says "udah cukup" or "save dong" or "publish", emit ready_to_launch — the UI will commit everything to the live tenant in one transaction.
5. Do NOT re-ask for food_type or location — they're set. Do NOT re-emit set_template unless the owner explicitly asks for a different layout.`;
  }
  return `Your goals, in order:
1. Ask for missing basics: name → food type → location → WhatsApp contact.
2. When they upload menu photos/PDF (UI handles the upload), say "oke aku baca dulu" — the UI will show the extracted menu.
3. When they upload a storefront photo, acknowledge briefly — UI shows colors.
4. If they ask for a logo, trigger generate_logo (we have an AI logo generator).
5. When menu + colors + logo + tagline are set, suggest launching.`;
};

const SYSTEM = (
  draft: TenantDraft,
  codegenAllowed: boolean,
  recentActionResults?: PriorActionResult[],
): string => {
  const reSetup = isReSetupMode(draft);

  // State extras: section IDs (authoritative), full draft JSON,
  // re-setup menu summary (only when seeded from a live tenant),
  // section catalog + props catalog (always — non-codegen tenants
  // still need the variant/prop reference), and codegen primitives
  // (only when the flag is on).
  const menuContext = reSetup
    ? `\n\nCurrent live menu (this is the source of truth — reference these item names exactly):\n\`\`\`\n${menuSummary(draft)}\n\`\`\``
    : '';

  const sectionContext = `\n\nStorefront sections currently on the page (in render order):\n\`\`\`\n${sectionsSummary(
    draft,
  )}\n\`\`\`\n\nAvailable section types and their variants:\n\`\`\`\n${sectionCatalog()}\n\`\`\`\n\nEditable props per section type (route layout/copy requests through update_section_props — NEVER refuse these):\n\`\`\`\n${sectionPropsCatalog()}\n\`\`\``;

  const codegenBlock = codegenAllowed ? CODEGEN_CAPABILITIES_BLOCK : '';

  const stateExtras = `\n${draftStateBlock(draft)}${menuContext}${sectionContext}${codegenBlock}`;

  const goals = `${SETUP_GOALS(draft)}

${TEMPLATE_PRESETS_BLOCK}

${SETUP_RULES_BLOCK}`;

  return buildSystemPrompt({
    kind: 'setup',
    header: SETUP_HEADER(draft),
    stateJson: JSON.stringify(draft, null, 2),
    stateExtras,
    goals,
    recentActionResults,
    codegenEnabled: codegenAllowed,
  });
};

function parseActions(text: string): OnboardingAction[] {
  const matches = text.matchAll(/<!--ACTION:(\{[\s\S]*?\})-->/g);
  const out: OnboardingAction[] = [];
  for (const m of matches) {
    try {
      out.push(JSON.parse(m[1]) as OnboardingAction);
    } catch {
      // Skip malformed markers — don't drop the whole batch.
    }
  }
  return out;
}

// Menu-mutation actions that are meaningless for ESB tenants (ESB owns the
// authoritative menu). The prompt already instructs the model not to emit
// these, but we strip them server-side as a belt-and-suspenders guard.
const ESB_FORBIDDEN_ACTIONS = new Set([
  'add_menu_item',
  'remove_menu_item',
  'update_menu_item',
  'generate_food_photo',
  'generate_all_photos',
]);

// Codegen-gated actions. Stripped server-side when feature flag is off
// — belt-and-suspenders for the prompt-level omission.
const CODEGEN_GATED_ACTIONS = new Set(['add_custom_section', 'update_custom_section']);

export async function POST(req: Request) {
  try {
    const key = await identityKey(req);
    const gate = allow('ai-chat', key, AI_RATE_PROFILES.chat);
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
      );
    }

    const body = (await req.json()) as ChatReq;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return badRequest('messages required');
    }

    const draft = body.draft ?? {};

    // Resolve the live tenant (if this chat is running against a
    // launched tenant). Pre-launch onboarding has no tenant row yet;
    // in that case `tenantId` stays null and codegen defaults off.
    const session = await getOwnerOrNull();
    const tenantId = session?.tenant.id ?? null;
    const codegenAllowed = await isCodegenEnabled(tenantId);

    // Drop any history entries with empty content before handing off to
    // Claude — Anthropic rejects the entire request if a single message
    // has "" for content. The UI pushes empty-content bubbles for photo
    // uploads (the attachments render locally, the text is blank), and
    // those sneak into the history next time the user sends a text.
    const cleanMessages = body.messages
      .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content.trim() }));
    if (cleanMessages.length === 0) {
      return badRequest('messages required');
    }

    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM(draft, codegenAllowed, body.recent_action_results),
      messages: cleanMessages,
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    let actions = parseActions(text);
    let clean = text.replace(/<!--ACTION:[\s\S]*?-->/g, '').trim();

    if (!codegenAllowed) {
      actions = actions.filter((a) => !CODEGEN_GATED_ACTIONS.has(a.type));
    }

    if (draft.pos_provider === 'esb') {
      const blocked = actions.filter((a) => ESB_FORBIDDEN_ACTIONS.has(a.type));
      if (blocked.length > 0) {
        actions = actions.filter((a) => !ESB_FORBIDDEN_ACTIONS.has(a.type));
        clean =
          `${clean}\n\n_Menu kamu disinkronisasi dari ESB — edit harga/availability di portal ESB ya._`.trim();
      }
    }

    return NextResponse.json({ message: clean, actions });
  } catch (err) {
    return errorResponse(err);
  }
}
