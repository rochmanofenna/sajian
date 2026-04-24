// POST /api/ai/extract-menu
//
// Accepts multipart form data with one or more `photos` entries. Each entry
// can be an image (JPEG/PNG/GIF/WebP) or a PDF. PDFs are forwarded to Claude
// as a document block so multi-page takeaway menus work end-to-end.
// Returns a structured menu tree:
//   { categories: [{ name, items: [{ name, description, price, tags }] }], confidence, notes }
//
// Resilience:
//   · Images are re-encoded via sharp to fit under Vercel's serverless body
//     limits (4.5MB request / response) before base64-ing to Claude — large
//     phone photos are often 10-15MB otherwise.
//   · The Anthropic call is wrapped in an AbortController with a 25s cap so
//     we return a clean error instead of hitting Vercel's 30s hard timeout.
//   · ALL exit paths return JSON — no route case should emit an HTML error
//     page back to the browser (which was crashing ChatPanel's JSON.parse).

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, CLAUDE_MODEL, extractJson } from '@/lib/ai/anthropic';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';
import { identityKey } from '@/lib/api/auth';

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
const IMAGE_MAX = 12 * 1024 * 1024;
const PDF_MAX = 32 * 1024 * 1024;

// Vercel serverless body limit (Hobby + Pro) is 4.5 MB. Leave headroom for
// multipart overhead + JSON around the base64 payloads.
const MAX_LONGEST_SIDE = 2000;
const JPEG_QUALITY = 80;
const CLAUDE_TIMEOUT_MS = 25_000;

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function POST(req: Request) {
  const key = await identityKey(req);
  const gate = allow('ai-extract-menu', key, AI_RATE_PROFILES.extract);
  if (!gate.ok) {
    return jsonError('Terlalu banyak upload menu. Coba lagi sebentar lagi.', 429, {
      retryAfter: gate.retryAfter,
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return jsonError('Body upload gagal dibaca.', 400, {
      reason: (err as Error).message,
    });
  }

  const photos = form.getAll('photos').filter((v): v is File => v instanceof File);
  if (photos.length === 0) return jsonError('photos required', 400);
  if (photos.length > 6) return jsonError('max 6 files per request', 400);

  for (const p of photos) {
    const isImage = IMAGE_TYPES.has(p.type);
    const isPdf = p.type === PDF_TYPE;
    if (!isImage && !isPdf) return jsonError(`unsupported type: ${p.type}`, 400);
    if (isImage && p.size > IMAGE_MAX) {
      return jsonError('Foto terlalu besar (>12MB). Coba foto yang lebih kecil.', 413);
    }
    if (isPdf && p.size > PDF_MAX) {
      return jsonError('PDF terlalu besar (>32MB). Pisah jadi beberapa file.', 413);
    }
  }

  // Prepare blocks — resize/compress images to keep the request under
  // Vercel's 4.5MB body limit and reduce Claude vision latency.
  let blocks: Anthropic.ContentBlockParam[];
  try {
    blocks = await Promise.all(
      photos.map(async (p) => {
        const bytes = Buffer.from(await p.arrayBuffer());
        if (p.type === PDF_TYPE) {
          return {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: bytes.toString('base64'),
            },
          };
        }
        const optimized = await optimizeImage(bytes);
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: optimized.toString('base64'),
          },
        };
      }),
    );
  } catch (err) {
    console.error('[extract-menu] preprocessing failed:', err);
    return jsonError(
      'Gagal memproses foto. Coba format lain (JPG/PNG) atau ukuran lebih kecil.',
      422,
      { reason: (err as Error).message },
    );
  }

  const anthropic = getAnthropic();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  let res: Anthropic.Message;
  try {
    res = await anthropic.messages.create(
      {
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
      },
      { signal: controller.signal },
    );
  } catch (err) {
    clearTimeout(timeoutHandle);
    const aborted =
      (err as { name?: string }).name === 'AbortError' ||
      (err as Error).message?.toLowerCase().includes('abort');
    if (aborted) {
      return jsonError(
        'Menu terlalu besar atau kompleks. Coba foto per halaman atau foto yang lebih kecil.',
        504,
      );
    }
    console.error('[extract-menu] claude call failed:', err);
    return jsonError('AI gagal merespon. Coba lagi dalam beberapa detik.', 502, {
      reason: (err as Error).message,
    });
  }
  clearTimeout(timeoutHandle);

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
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
}

// Downscale + re-encode to JPEG. Keeps the longest side <= MAX_LONGEST_SIDE
// and drops most of the weight of 48-megapixel phone photos. Auto-rotates
// based on EXIF so sideways photos extract correctly.
async function optimizeImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: MAX_LONGEST_SIDE,
      height: MAX_LONGEST_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
