// POST /api/ai/extract-menu
//
// Accepts multipart form data with one or more `photos` entries. Each entry
// can be an image (JPEG/PNG/GIF/WebP) or a PDF. PDFs are forwarded to Claude
// as a document block so multi-page takeaway menus work end-to-end.
// Returns a structured menu tree:
//   { categories: [{ name, items: [{ name, description, price, tags }] }], confidence, notes }
//
// No file is persisted — we read the bytes into memory and forward as base64
// in the same request. If extraction fails to produce valid JSON we return
// 422 so the UI can prompt the owner for clearer inputs.

import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, CLAUDE_MODEL, extractJson } from '@/lib/ai/anthropic';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ExtractedMenu {
  categories: Array<{
    name: string;
    items: Array<{
      name: string;
      description: string;
      price: number;
      tags?: string[];
    }>;
  }>;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const PDF_TYPE = 'application/pdf';
const IMAGE_MAX = 8 * 1024 * 1024;
const PDF_MAX = 32 * 1024 * 1024;

type ImageMedia = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const photos = form.getAll('photos').filter((v): v is File => v instanceof File);
    if (photos.length === 0) return badRequest('photos required');
    if (photos.length > 6) return badRequest('max 6 files per request');

    for (const p of photos) {
      const isImage = IMAGE_TYPES.has(p.type);
      const isPdf = p.type === PDF_TYPE;
      if (!isImage && !isPdf) return badRequest(`unsupported type: ${p.type}`);
      if (isImage && p.size > IMAGE_MAX) return badRequest('each image must be <8MB');
      if (isPdf && p.size > PDF_MAX) return badRequest('PDF must be <32MB');
    }

    const blocks: Anthropic.ContentBlockParam[] = await Promise.all(
      photos.map(async (p) => {
        const data = Buffer.from(await p.arrayBuffer()).toString('base64');
        if (p.type === PDF_TYPE) {
          return {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data },
          };
        }
        return {
          type: 'image',
          source: { type: 'base64', media_type: p.type as ImageMedia, data },
        };
      }),
    );

    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            ...blocks,
            {
              type: 'text',
              text: `You are analyzing a restaurant menu from Indonesia. The input may be photos of a physical menu, pages of a PDF, or a mix of both.

Extract EVERY menu item visible. Return a JSON object with exactly this shape:

{
  "categories": [
    {
      "name": "Category Name",
      "items": [
        {
          "name": "Item Name",
          "description": "Brief appetizing Indonesian description (1 sentence). Generate one if not on menu.",
          "price": 25000,
          "tags": []
        }
      ]
    }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "Any items hard to read or uncertain prices"
}

Rules:
- Prices are Indonesian Rupiah as integers. "25K" → 25000. "25.000" → 25000. "25rb" → 25000.
- If a price is unclear, make a best guess and flag it in notes.
- Group items into logical Indonesian categories (Makanan, Minuman, Cemilan, Dessert, Nasi, Lauk, etc).
- Keep item names in Indonesian exactly as printed. Don't translate.
- If an item has S/M/L or Panas/Dingin variants, list the base item at the lowest price.
- Add "bestseller" tag only if the menu explicitly marks it.
- Return ONLY the JSON. No markdown fences, no commentary.`,
            },
          ],
        },
      ],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    try {
      const menu = extractJson<ExtractedMenu>(text);
      if (!menu.categories?.length) throw new Error('no categories');
      return NextResponse.json(menu);
    } catch (parseErr) {
      console.error('[extract-menu] parse failed', {
        stop_reason: res.stop_reason,
        usage: res.usage,
        err: (parseErr as Error).message,
        preview: text.slice(0, 800),
      });
      return NextResponse.json(
        {
          error: 'Gagal baca menu. Coba foto yang lebih jelas.',
          debug: {
            stop_reason: res.stop_reason,
            preview: text.slice(0, 400),
          },
        },
        { status: 422 },
      );
    }
  } catch (err) {
    return errorResponse(err);
  }
}
