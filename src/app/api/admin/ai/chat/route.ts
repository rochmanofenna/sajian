// POST /api/admin/ai/chat — owner-gated live-ops chat.
//
// Same action-marker protocol as /api/ai/chat. Both routes go
// through the unified buildSystemPrompt() in src/lib/ai/system-
// prompt.ts so hardening (banned phrases, decision tree, roadmap
// pattern, settings registry) cannot drift between surfaces. This
// route differs from setup only in:
//
//   1. Header — addresses the LIVE tenant, not a draft.
//   2. State JSON — live tenant brand row (no draft).
//   3. State extras — actual category + menu-item rows with IDs
//      so the AI can reference them in by-id actions
//      (update_menu_item, remove_item, add_item).
//   4. Goals — confirm destructive operations before emitting,
//      reload context message.
//
// The action catalog filters to admin-eligible actions
// automatically via routeKind='admin'. Setup-only actions
// (add_custom_section, update_name, ready_to_launch) are excluded.

import { NextResponse } from 'next/server';
import { getAnthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { buildSystemPrompt, type PriorActionResult } from '@/lib/ai/system-prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface AdminChatReq {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Read-back loop — same shape as /api/ai/chat. Optional until
   *  the admin client (AdminAIWorkspace) starts tracking results. */
  recent_action_results?: PriorActionResult[];
}

interface MenuItemRow {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
}

const ADMIN_HEADER = (tenantName: string): string =>
  `You are ${tenantName}'s live management assistant. The owner is talking to you to change their LIVE storefront and menu.`;

const ADMIN_GOALS = `Goals:
- Confirm what you're about to change BEFORE emitting the action marker.
- For remove_item / delete_location / set_template that changes the look dramatically: ASK first ("Oke hapus [item]? Ketik 'ya'") and only emit on confirmation.
- For destructive actions on roadmap-shaped requests (modifier groups, loyalty, vouchers, reservations, subscriptions), use log_roadmap_request with a concrete workaround — don't refuse politely, don't pretend the feature exists.
- After a successful change, the next user turn re-loads the live state, so you'll see the effect.

Rules:
- MATCH item names case-insensitively and fuzzily (e.g. "nasi goreng" matches "NASI GORENG SEAFOOD" if that's the closest). If multiple items could match, ASK which one.
- For add_item: use the category_id from the list above. If the owner didn't say which category, ASK — don't guess.
- Prices are integers in Rupiah. "28 ribu"/"28rb"/"28K" → 28000.
- Colors: hex strings like "#1B5E3B". If the owner says "lebih gelap", darken current primary by ~20%.
- Template: one of kedai | warung | modern | food-hall | classic.
- Days of week keys: monday..sunday (lowercase English) for operating_hours.
- Never emit an action without being asked. If the request is ambiguous, ASK.
- Each action marker must be valid JSON on a single line. Place all markers at the very end, one per line.

Phrase mapping (semantic, not literal):
- "nasi goreng habis hari ini"   → update_menu_item field=is_available value=false (admin: by id)
- "naikin harga nasi goreng jadi 30rb" → update_menu_item field=price value=30000
- "tambahin es kopi susu 15rb ke minuman" → add_item category_id=<uuid of Minuman> name=... price=15000
- "hapus nasi goreng seafood"    → remove_item id=<uuid> (after confirmation)
- "ganti warna primary ke hijau gelap" → update_colors colors={"primary":"#..."}
- "tagline-nya ganti jadi X"     → update_tagline
- "jam buka hari ini 10 pagi"    → update_hours
- "ganti layout kayak warung"    → set_template template="warung"
- "ganti font heading ke Poppins" → update_tenant_setting key=heading_font_family value="Poppins"
- "matikan multi branch"          → update_tenant_setting key=multi_branch_mode value=false
- "tambahin sistem membership"   → log_roadmap_request category="loyalty" + concrete workaround
- "input voucher code di pembayaran" → log_roadmap_request category="gift_cards" + manual-WhatsApp workaround
- "kategori additional buat upselling" → log_roadmap_request category="modifiers" + Tambahan-category workaround
- "atur urutan section" → reorder_sections (use exact section_id values from <current_draft_state> when provided, otherwise ASK)`;

function buildStateExtras(
  categories: CategoryRow[],
  items: Array<MenuItemRow & { category_id: string | null }>,
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const catLines = categories.map((c) => `- "${c.name}" (id: ${c.id})`).join('\n');
  const itemLines = items
    .map(
      (it) =>
        `- "${it.name}" (id: ${it.id}, price: ${it.price}, ${it.is_available ? 'available' : 'SOLD OUT'}, cat: ${
          it.category_id ? catMap.get(it.category_id) ?? '?' : '—'
        })`,
    )
    .join('\n');

  return `

Categories (${categories.length} total):
${catLines || '(kosong)'}

Menu items (${items.length} total):
${itemLines || '(kosong)'}`;
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const body = (await req.json()) as AdminChatReq;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return badRequest('messages required');
    }

    const supabase = createServiceClient();
    const [{ data: cats }, { data: items }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('id, name, price, is_available, category_id')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true }),
    ]);

    const stateJson = JSON.stringify(
      {
        name: tenant.name,
        tagline: tenant.tagline,
        theme_template: tenant.theme_template,
        colors: tenant.colors,
        operating_hours: tenant.operating_hours,
      },
      null,
      2,
    );

    const system = buildSystemPrompt({
      kind: 'admin',
      header: ADMIN_HEADER(tenant.name),
      stateJson,
      stateExtras: buildStateExtras(
        (cats ?? []) as CategoryRow[],
        (items ?? []) as Array<MenuItemRow & { category_id: string | null }>,
      ),
      goals: ADMIN_GOALS,
      recentActionResults: body.recent_action_results,
    });

    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const actions: unknown[] = [];
    for (const m of text.matchAll(/<!--ACTION:(\{[\s\S]*?\})-->/g)) {
      try {
        actions.push(JSON.parse(m[1]));
      } catch {
        // skip malformed
      }
    }
    const clean = text.replace(/<!--ACTION:[\s\S]*?-->/g, '').trim();
    return NextResponse.json({ message: clean, actions });
  } catch (err) {
    return errorResponse(err);
  }
}
