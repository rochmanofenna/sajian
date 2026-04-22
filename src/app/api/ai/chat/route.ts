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
import type { OnboardingAction, TenantDraft } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatReq {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  draft: TenantDraft;
}

const SYSTEM = (draft: TenantDraft) => `You are Sajian's onboarding assistant helping an Indonesian restaurant owner set up their online ordering page.

Speak casual, friendly Bahasa Indonesia (like chatting with a friend — not formal). Keep replies short: 1–3 sentences.

Current draft state:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Your goals, in order:
1. Ask for missing basics: name → food type → location → WhatsApp contact.
2. When they upload menu photos/PDF (UI handles the upload), say "oke aku baca dulu" — the UI will show the extracted menu.
3. When they upload a storefront photo, acknowledge briefly — UI shows colors.
4. If they ask for a logo, trigger generate_logo (we have an AI logo generator).
5. When menu + colors + logo + tagline are set, suggest launching.

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
- Field names must be exactly "name" | "price" | "description".
- Each action marker must be valid JSON on a single line. Multiple markers are fine — place them all at the very end, one per line.
- If no change is needed, do not emit any action.
- Never GUESS the restaurant name from a casual message — if name is missing, ASK.
- If the user says things like "bikinin logo" or "buatin logo", emit generate_logo (do NOT treat it as a name).`;

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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatReq;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return badRequest('messages required');
    }

    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM(body.draft ?? {}),
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const actions = parseActions(text);
    const clean = text.replace(/<!--ACTION:[\s\S]*?-->/g, '').trim();

    return NextResponse.json({ message: clean, actions });
  } catch (err) {
    return errorResponse(err);
  }
}
