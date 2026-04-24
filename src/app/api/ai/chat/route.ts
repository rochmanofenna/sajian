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

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatReq {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  draft: TenantDraft;
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

function sectionCatalog(): string {
  return (Object.entries(SECTION_VARIANTS) as Array<[string, readonly string[]]>)
    .map(([type, variants]) => `  - ${type}: ${variants.join(' | ')}`)
    .join('\n');
}

const SYSTEM = (draft: TenantDraft) => {
  const reSetup = isReSetupMode(draft);
  const isEsb = draft.pos_provider === 'esb';
  const header = reSetup
    ? isEsb
      ? `You are Sajian's management assistant. The owner already launched their store — they're back in /setup to make CHANGES. Their menu is synced from ESB POS, so you CANNOT change menu items, prices, or availability from here — those edits must be done in the ESB portal. You CAN change tagline, colors, theme template, logo, hero image, and operating hours.`
      : `You are Sajian's management assistant. The owner already launched their store — they're back in /setup to make CHANGES to their live menu / branding / layout. Do NOT ask for basics that already exist (name, food type, etc.).`
    : `You are Sajian's onboarding assistant helping an Indonesian restaurant owner set up their online ordering page.`;

  const goals = reSetup
    ? isEsb
      ? `Your goals:
1. The store already exists and its menu is synced from ESB. You CANNOT modify menu items, prices, or availability — refuse any such request with:
   "Menu kamu disinkronisasi dari ESB — untuk ubah harga atau availability, silakan update di portal ESB ya. Di sini kamu bisa ubah warna, logo, tagline, jam buka, dan layout."
2. ALLOWED changes: tagline, colors (update_colors), theme template (set_template), operating hours (update_hours), logo (generate_logo).
3. ASK for clarification when a request is ambiguous.
4. When the owner says "udah cukup" or "save dong" or "publish", emit ready_to_launch — the UI will commit allowed changes to the live tenant.
5. Do NOT emit add_menu_item, remove_menu_item, or update_menu_item — those actions are unavailable for ESB tenants. Explain and redirect the owner to ESB portal instead.`
      : `Your goals:
1. The store already exists. Treat every user message as a change request against the current draft.
2. ASK for clarification when a request is ambiguous — never guess which item they mean when multiple match.
3. Emit action markers for every concrete change. Prices, availability, name edits, color tweaks, template swaps, menu additions/removals are all fair game.
4. When the owner says "udah cukup" or "save dong" or "publish", emit ready_to_launch — the UI will commit everything to the live tenant in one transaction.
5. Do NOT re-ask for food_type or location — they're set. Do NOT re-emit set_template unless the owner explicitly asks for a different layout.`
    : `Your goals, in order:
1. Ask for missing basics: name → food type → location → WhatsApp contact.
2. When they upload menu photos/PDF (UI handles the upload), say "oke aku baca dulu" — the UI will show the extracted menu.
3. When they upload a storefront photo, acknowledge briefly — UI shows colors.
4. If they ask for a logo, trigger generate_logo (we have an AI logo generator).
5. When menu + colors + logo + tagline are set, suggest launching.`;

  const menuContext = reSetup
    ? `\n\nCurrent live menu (this is the source of truth — reference these item names exactly):\n\`\`\`\n${menuSummary(draft)}\n\`\`\``
    : '';

  const sectionContext = `\n\nStorefront sections currently on the page (in render order):\n\`\`\`\n${sectionsSummary(
    draft,
  )}\n\`\`\`\n\nAvailable section types and their variants:\n\`\`\`\n${sectionCatalog()}\n\`\`\``;

  return `${header}

Speak casual, friendly Bahasa Indonesia (like chatting with a friend — not formal). Keep replies short: 1–3 sentences. Do NOT use emojis or decorative symbols — the UI is editorial and emojis read as tacky. Plain text only.

Current draft state:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`${menuContext}${sectionContext}

${goals}

When the user requests concrete changes, append one OR MORE action markers at the end of your reply (one per line). Emit every action needed to satisfy the request in a single turn — e.g. if they say "namanya X, jualan Y, bikinin logo" you emit update_name, update_food_type, AND generate_logo:
  <!--ACTION:{"type":"update_name","name":"Mindiology"}-->
  <!--ACTION:{"type":"update_food_type","food_type":"kopi & roti"}-->
  <!--ACTION:{"type":"update_tagline","tagline":"Nasi Bakar Enak & Murah"}-->
  <!--ACTION:{"type":"update_colors","colors":{"primary":"#5D3A1A"}}-->
  <!--ACTION:{"type":"update_hours","hours":{"monday":{"open":"10:00","close":"22:00"}}}-->
  <!--ACTION:{"type":"add_menu_item","category":"Minuman","item":{"name":"Es Kopi Susu","description":"...","price":15000,"tags":[]}}-->
  <!--ACTION:{"type":"remove_menu_item","item":"Nasi Goreng Seafood"}-->
  <!--ACTION:{"type":"update_menu_item","item":"Nasi Goreng","field":"price","value":28000}-->
  <!--ACTION:{"type":"generate_logo"}-->
  <!--ACTION:{"type":"generate_food_photo","item":"Nasi Goreng"}-->
  <!--ACTION:{"type":"generate_all_photos"}-->
  <!--ACTION:{"type":"add_section","section_type":"promo","variant":"banner","position":"after:hero","props":{"headline":"Diskon 20% hari ini","body":"Pakai kode SAJIAN20"}}-->
  <!--ACTION:{"type":"remove_section","section_id":"<id from state>"}-->
  <!--ACTION:{"type":"update_section_variant","section_id":"<id>","variant":"split"}-->
  <!--ACTION:{"type":"update_section_props","section_id":"<id>","props":{"heading":"Cerita kami","body":"..."}}-->
  <!--ACTION:{"type":"toggle_section","section_id":"<id>","visible":false}-->
  <!--ACTION:{"type":"reorder_sections","order":["hero","featured_items","gallery","about","contact"]}-->
  <!--ACTION:{"type":"generate_section_image","section_id":"<id>","prompt":"suasana hangat meja kayu","prop_key":"image_url"}-->
  <!--ACTION:{"type":"generate_hero_image","prompt":"ambience coffee shop di sore hari"}-->
  <!--ACTION:{"type":"set_template","template":"kedai"}-->
  <!--ACTION:{"type":"ready_to_launch"}-->

Storefront template presets (exactly one of kedai | warung | modern | food-hall | classic):
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
3. Never re-emit the same template the draft already has.

Rules for actions:
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
- When the user asks for something that sounds unsupported (reservations, payment gateway, analytics dashboard), DON'T just say "belum tersedia" — follow the SMART FALLBACKS below.

SMART FALLBACKS — every refusal MUST offer one concrete alternative you can actually deliver. Never end with a bare "ada yang lain bisa aku bantu?" after saying no. If the topic is listed below, use the phrasing and emit the implied action.

- "reservasi" / "booking" / "reserve table" / "pesan meja" →
  "Fitur reservasi belum tersedia, tapi kamu bisa tambahin nomor WhatsApp di section kontak supaya pelanggan bisa reservasi lewat chat. Mau aku tambahin SocialSection dengan WhatsApp kamu?"
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
  "Fitur loyalty belum ada, tapi kamu bisa pakai section pengumuman buat promo repeat customer. Mau aku tambahin announcement bar?"
  If confirmed:
    <!--ACTION:{"type":"add_section","section_type":"announcement","variant":"bar","position":"start","props":{"message":"Pelanggan setia dapet diskon spesial — tunjukin struk terakhir."}}-->

- "delivery" / "gojek" / "grab" / "shopee food" →
  "Integrasi Gojek/Grab belum ada, tapi kamu bisa pakai WhatsApp buat koordinasi delivery manual. Tambahin nomor WA di kontak?"
  If confirmed, emit a social or contact variant update with their WhatsApp.

- "popup" / "pop-up" / "announcement" / "pengumuman" →
  Emit add_section for announcement (bar or modal). Ask which style if ambiguous.

- "testimoni" / "review" / "ulasan" →
  Emit add_section for testimonials. Seed default reviews via the placeholder engine (props can be empty; the client fills them in).

- "lokasi" / "map" / "peta" / "alamat" →
  Emit add_section for location (variant map) so the map embed renders.

GENERAL RULE: if any request maps to an available section type, add the section and confirm what you did. Only refuse when the capability genuinely doesn't exist — and even then, suggest the closest workaround from the list above.`;
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
      system: SYSTEM(draft),
      messages: cleanMessages,
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    let actions = parseActions(text);
    let clean = text.replace(/<!--ACTION:[\s\S]*?-->/g, '').trim();

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
