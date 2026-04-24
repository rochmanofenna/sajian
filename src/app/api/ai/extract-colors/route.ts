// POST /api/ai/extract-colors
//
// One storefront photo → four-color palette matching the restaurant's vibe.
// Returns the same { primary, accent, background, dark } shape that
// tenants.colors stores.

import { NextResponse } from 'next/server';
import { getAnthropic, CLAUDE_MODEL, extractJson } from '@/lib/ai/anthropic';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';
import { identityKey } from '@/lib/api/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface Palette {
  primary: string;
  accent: string;
  background: string;
  dark: string;
  reasoning?: string;
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function POST(req: Request) {
  try {
    const key = await identityKey(req);
    const gate = allow('ai-extract-colors', key, AI_RATE_PROFILES.extract);
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
      );
    }

    const form = await req.formData();
    const photo = form.get('photo');
    if (!(photo instanceof File)) return badRequest('photo required');
    if (!ALLOWED.has(photo.type)) return badRequest(`unsupported type: ${photo.type}`);
    if (photo.size > 8 * 1024 * 1024) return badRequest('photo must be <8MB');

    const buf = Buffer.from(await photo.arrayBuffer());
    const anthropic = getAnthropic();

    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: photo.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: buf.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `Analyze this Indonesian restaurant storefront photo and extract a color palette for their ordering website.

Return JSON:
{
  "primary": "#HEXCODE",     // dominant brand color from signage / walls
  "accent": "#HEXCODE",      // secondary highlight
  "background": "#HEXCODE",  // light page background, warm + readable
  "dark": "#HEXCODE",        // dark text color
  "reasoning": "one-sentence explanation"
}

Rules:
- All colors are 7-char hex (#RRGGBB), uppercase.
- background must be light (L > 85 in HSL). dark must be near-black (L < 25).
- primary and accent should feel warm and appetizing, appropriate for Indonesian F&B.
- Return ONLY the JSON, no fences.`,
            },
          ],
        },
      ],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    try {
      const palette = extractJson<Palette>(text);
      return NextResponse.json(palette);
    } catch {
      return NextResponse.json(
        { error: 'Gagal analisa warna. Coba foto lain.' },
        { status: 422 },
      );
    }
  } catch (err) {
    return errorResponse(err);
  }
}
