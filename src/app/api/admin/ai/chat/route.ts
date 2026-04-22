// POST /api/admin/ai/chat — owner-gated live-ops chat.
//
// Same action-marker protocol as /api/ai/chat, but the system context is the
// LIVE tenant (brand + menu items loaded from Supabase) and the emitted
// actions map to admin mutations applied by the client against
// /api/admin/tenant and /api/admin/menu/[id].
//
// We pass item IDs in the system prompt so the model can reference specific
// rows without guessing. The prompt includes only a lightweight summary
// (name + price + availability) — descriptions are omitted to keep the
// context small when tenants have 100+ items.

import { NextResponse } from 'next/server';
import { getAnthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface AdminChatReq {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
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

const SYSTEM = (
  tenantName: string,
  tagline: string | null,
  template: string,
  colors: { primary: string; accent: string; background: string; dark: string },
  hours: unknown,
  categories: CategoryRow[],
  items: Array<MenuItemRow & { category_id: string | null }>,
) => {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const itemLines = items
    .map(
      (it) =>
        `- "${it.name}" (id: ${it.id}, price: ${it.price}, ${it.is_available ? 'available' : 'SOLD OUT'}, cat: ${
          it.category_id ? catMap.get(it.category_id) ?? '?' : '—'
        })`,
    )
    .join('\n');

  return `You are ${tenantName}'s live management assistant. The owner is talking to you to change their LIVE storefront and menu.

Speak casual Bahasa Indonesia (like chatting with a friend). Keep replies short: 1-2 sentences. Confirm what you're about to change, then emit the action marker.

Current live state:
\`\`\`json
${JSON.stringify({ tagline, theme_template: template, colors, operating_hours: hours }, null, 2)}
\`\`\`

Menu items (${items.length} total):
${itemLines || '(kosong)'}

When the owner asks for a change, append ONE OR MORE action markers at the end of your reply, one per line. Every change the owner asked for must be emitted in a single turn.

Available actions:
  <!--ACTION:{"type":"update_tagline","tagline":"Kopi & sandwich paling enak di Bintaro"}-->
  <!--ACTION:{"type":"update_colors","colors":{"primary":"#1B5E3B"}}-->
  <!--ACTION:{"type":"set_template","template":"kedai"}-->
  <!--ACTION:{"type":"update_hours","hours":{"monday":{"open":"08:00","close":"22:00"}}}-->
  <!--ACTION:{"type":"update_menu_item","id":"<uuid>","field":"is_available","value":false}-->
  <!--ACTION:{"type":"update_menu_item","id":"<uuid>","field":"price","value":28000}-->
  <!--ACTION:{"type":"update_menu_item","id":"<uuid>","field":"name","value":"Kopi Susu Gula Aren"}-->
  <!--ACTION:{"type":"update_menu_item","id":"<uuid>","field":"description","value":"Susu segar + gula aren"}-->

Phrase mapping (examples — match semantically, don't pattern-match literally):
- "nasi goreng habis hari ini"   → update_menu_item field=is_available value=false
- "kopi susu gula aren available lagi" → update_menu_item field=is_available value=true
- "naikin harga nasi goreng jadi 30rb" → update_menu_item field=price value=30000
- "ganti warna primary ke hijau gelap" → update_colors colors={"primary":"#..."}
- "tagline-nya ganti jadi X"     → update_tagline
- "jam buka hari ini 10 pagi"    → update_hours hours={"monday":{"open":"10:00","close":"22:00"}}
- "ganti layout kayak warung"    → set_template template="warung"

Rules:
- MATCH item names case-insensitively and fuzzily (e.g. "nasi goreng" matches "NASI GORENG SEAFOOD" if that's the closest). If multiple items could match, ASK which one.
- Prices are integers in Rupiah. "28 ribu"/"28rb"/"28K" → 28000.
- Colors: hex strings like "#1B5E3B". If the owner says "lebih gelap", darken the current primary by ~20%. If "lebih warm", shift toward warmer hue.
- Template: one of kedai | warung | modern | food-hall | classic.
- Days of week keys: monday..sunday (lowercase English) for operating_hours.
- Never emit an action without being asked. If the request is ambiguous, ASK.
- Each action marker must be valid JSON on a single line. Place all markers at the very end, one per line.
- After a successful change you'll see the effect on the next message because the draft context re-loads.`;
};

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

    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM(
        tenant.name,
        tenant.tagline,
        tenant.theme_template,
        tenant.colors,
        tenant.operating_hours,
        (cats ?? []) as CategoryRow[],
        (items ?? []) as Array<MenuItemRow & { category_id: string | null }>,
      ),
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
