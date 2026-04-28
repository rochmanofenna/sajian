// POST /api/ai/extract-menu
//
// Accepts multipart form data with one or more `photos` entries. Each entry
// can be an image (JPEG/PNG/GIF/WebP) or a PDF. PDFs are SPLIT page-by-page
// via pdf-lib and each page is sent to Claude vision as its own document
// block — running in parallel with a concurrency cap. Aggregates per-page
// results, dedupes items by name within a category, and surfaces partial
// successes ("12 dari 20 halaman terbaca") instead of a hard failure when
// only some pages choke.
//
// Returns a structured menu tree:
//   { categories: [...], confidence, notes, summary: { pages_total, pages_ok, pages_failed } }

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, CLAUDE_MODEL, extractJson } from '@/lib/ai/anthropic';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';
import { identityKey } from '@/lib/api/auth';
import { getOwnerOrNull } from '@/lib/admin/auth';

export const runtime = 'nodejs';
// Bumped 60s → 300s on 2026-04-28 after Vercel function timeout
// hit on Mindiology's 20-page PDF. Worst-case wall-clock with
// PARALLEL_CAP=6: ~4 batches × 35s per-block timeout = 140s.
// Average ~10s/page = ~40s. 300s gives us 2× headroom on the
// worst-case path. Vercel Pro caps at 300s; do not bump higher
// without changing plan tier.
export const maxDuration = 300;

interface ExtractedItem {
  name: string;
  description: string;
  price: number;
  tags?: string[];
}
interface ExtractedCategory {
  name: string;
  items: ExtractedItem[];
}
interface ExtractedMenu {
  categories: ExtractedCategory[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const PDF_TYPE = 'application/pdf';
const IMAGE_MAX = 12 * 1024 * 1024;
const PDF_MAX = 32 * 1024 * 1024;

const MAX_LONGEST_SIDE = 1600;
const JPEG_QUALITY = 72;
// Per-page Anthropic vision call timeout. 35s post-2026-04-27 (was 22s)
// gives image-heavy / scanned PDF pages enough headroom to OCR.
// Bounded by maxDuration above.
const PER_BLOCK_TIMEOUT_MS = 35_000;
// 8000 (was 3500) — the previous cap was tight for dense menu pages
// where dozens of items + descriptions push past 3500 output tokens
// and the model truncates mid-JSON. Bumping doesn't increase cost
// (only billed for tokens actually used); it just removes a silent
// truncation failure mode.
const PER_BLOCK_MAX_TOKENS = 8_000;
// 6 (was 3) — halves the number of serial batches for a 20-page PDF
// (4 batches at cap=6 vs 7 at cap=3), bringing wall-clock comfortably
// inside the 300s function budget. Tier-3 Anthropic limits handle
// 6 concurrent vision calls without rate-limiting.
const PARALLEL_CAP = 6;
const MAX_PAGES_PER_PDF = 30;

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

const PAGE_PROMPT = `You are reading ONE page of an Indonesian restaurant menu. Extract EVERY menu item visible on this single page.

Return ONLY this JSON (no markdown fences, no commentary):

{
  "categories": [
    {
      "name": "Category Name",
      "items": [
        { "name": "Item Name", "description": "...", "price": 25000, "tags": [] }
      ]
    }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "..."
}

Rules:
- Prices are Indonesian Rupiah, ALWAYS as integers (no decimals, no currency symbols).
  Examples (these all mean the same thing — 30,000 rupiah):
    "30K" → 30000
    "30k" → 30000
    "Rp 30.000" → 30000
    "Rp30.000" → 30000
    "Rp 30,000" → 30000
    "30.000" → 30000
    "30,000" → 30000
    "30rb" → 30000
    "30 ribu" → 30000
    "30" (when next to other items priced like "32K", "28K") → 30000
  Plausibility check: any price < 1000 is wrong — multiply by 1000 (it was K-shorthand). Any price > 1,000,000 is also wrong (probably double-multiplied). Sane range: 5000–500000.
- A category title appears as a large header on the page (e.g. BREAKFAST, MAINCOURSE, NOODLES, SANDWICH, RICE BOWL, SNACK, DESSERT, SOFT BREAD, DONUT, PASTRY, EXCLUSIVE BEVERAGE, CLASSIC COFFEE, FILTER COFFEE, NON COFFEE, MOCKTAIL, TEA, JUICE, MAKANAN, MINUMAN, NASI, LAUK, CEMILAN). Apply that category to every item under it on the page. If no header is visible, group everything under "Lainnya".
- Keep item names IN INDONESIAN exactly as printed. Do not translate to English. Title-case is fine.
- Description is the appetizing one-sentence blurb on the menu. If the menu has none, write a one-sentence Indonesian description yourself based on the item name.
- If an item has S/M/L or Panas/Dingin variants, use the BASE name and the LOWEST price. Don't fork into multiple rows.
- Only add the "bestseller" tag if the menu explicitly marks it (e.g. star, badge, "BEST SELLER" label).
- If a price is genuinely unreadable, set price=0 and add the item name to "notes". Don't drop the item.
- This is one PAGE of a multi-page menu. Don't mention other pages.`;

async function buildBlocksForFile(
  file: File,
): Promise<{ blocks: Anthropic.ContentBlockParam[]; pageLabels: string[] }> {
  const bytes = Buffer.from(await file.arrayBuffer());

  if (file.type === PDF_TYPE) {
    // Split into individual single-page PDFs. Each page becomes one
    // independent vision request — failures isolated, latency capped.
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (err) {
      throw new Error(`PDF tidak bisa dibaca: ${(err as Error).message}`);
    }
    const pageCount = Math.min(pdf.getPageCount(), MAX_PAGES_PER_PDF);
    const blocks: Anthropic.ContentBlockParam[] = [];
    const labels: string[] = [];
    for (let i = 0; i < pageCount; i += 1) {
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(pdf, [i]);
      single.addPage(copied);
      const pageBytes = Buffer.from(await single.save());
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pageBytes.toString('base64'),
        },
      });
      labels.push(`${file.name || 'PDF'} hal ${i + 1}`);
    }
    return { blocks, pageLabels: labels };
  }

  if (IMAGE_TYPES.has(file.type)) {
    const optimized = await optimizeImage(bytes);
    return {
      blocks: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: optimized.toString('base64'),
          },
        },
      ],
      pageLabels: [file.name || 'Foto'],
    };
  }

  throw new Error(`unsupported type: ${file.type}`);
}

async function extractOneBlock(
  anthropic: Anthropic,
  block: Anthropic.ContentBlockParam,
): Promise<
  | { ok: true; menu: ExtractedMenu; ms: number }
  | { ok: false; reason: string; ms: number }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_BLOCK_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await anthropic.messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: PER_BLOCK_MAX_TOKENS,
        messages: [
          { role: 'user', content: [block, { type: 'text', text: PAGE_PROMPT }] },
        ],
      },
      { signal: controller.signal },
    );
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const menu = extractJson<ExtractedMenu>(text);
    if (!menu.categories?.length) {
      return { ok: false, reason: 'no_categories', ms: Date.now() - startedAt };
    }
    return { ok: true, menu: normalizeMenu(menu), ms: Date.now() - startedAt };
  } catch (err) {
    const aborted =
      (err as { name?: string }).name === 'AbortError' ||
      (err as Error).message?.toLowerCase().includes('abort');
    return {
      ok: false,
      reason: aborted ? 'timeout' : (err as Error).message,
      ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

// In-place normalization. Bumps obviously-wrong K-shorthand prices
// (price < 1000 → ×1000) and trims junk. Keeps zero-price entries
// because the prompt asked us to flag them rather than drop them.
function normalizeMenu(menu: ExtractedMenu): ExtractedMenu {
  for (const cat of menu.categories) {
    cat.name = (cat.name ?? '').trim() || 'Lainnya';
    for (const item of cat.items ?? []) {
      item.name = (item.name ?? '').trim();
      item.description = (item.description ?? '').trim();
      const p = Number(item.price);
      if (!Number.isFinite(p) || p < 0) item.price = 0;
      else if (p > 0 && p < 1000) item.price = Math.round(p) * 1000;
      else if (p > 5_000_000) item.price = 0;
      else item.price = Math.round(p);
    }
  }
  return menu;
}

// Concurrency-capped Promise.all. Keeps Anthropic happy on 20-page
// PDFs without launching 20 simultaneous vision calls.
async function mapWithLimit<T, U>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => pump());
  await Promise.all(runners);
  return results;
}

function mergeMenus(parts: ExtractedMenu[]): ExtractedMenu {
  // Per-category bucket, items deduped by lowercase name. First
  // occurrence wins — earlier pages tend to have the canonical
  // category+price, later pages often repeat with variants.
  const catMap = new Map<string, { name: string; items: Map<string, ExtractedItem> }>();
  let confidence: ExtractedMenu['confidence'] = 'high';
  const noteParts: string[] = [];
  for (const part of parts) {
    if (part.confidence === 'low') confidence = 'low';
    else if (part.confidence === 'medium' && confidence === 'high') confidence = 'medium';
    if (part.notes) noteParts.push(part.notes);
    for (const cat of part.categories) {
      const key = cat.name.trim().toLowerCase();
      if (!catMap.has(key)) catMap.set(key, { name: cat.name.trim(), items: new Map() });
      const bucket = catMap.get(key)!;
      for (const item of cat.items) {
        const itemKey = item.name.trim().toLowerCase();
        if (!itemKey) continue;
        if (!bucket.items.has(itemKey)) {
          bucket.items.set(itemKey, item);
        }
      }
    }
  }
  return {
    categories: Array.from(catMap.values()).map((c) => ({
      name: c.name,
      items: Array.from(c.items.values()),
    })),
    confidence,
    notes: noteParts.length ? noteParts.join(' · ') : undefined,
  };
}

export async function POST(req: Request) {
  const key = await identityKey(req);
  const gate = allow('ai-extract-menu', key, AI_RATE_PROFILES.extract);
  if (!gate.ok) {
    return jsonError('Terlalu banyak upload menu. Coba lagi sebentar lagi.', 429, {
      error_code: 'rate_limited',
      retryAfter: gate.retryAfter,
    });
  }

  // Tenant id is best-effort — extract-menu runs both during pre-launch
  // onboarding (no tenant yet) and re-setup against a live tenant.
  // When present, every per-page log line is keyed by it so Vercel
  // function logs can be filtered to a specific restaurant's session.
  const session = await getOwnerOrNull();
  const tenantId = session?.tenant.id ?? null;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return jsonError('Body upload gagal dibaca.', 400, {
      error_code: 'form_parse_failed',
      reason: (err as Error).message,
    });
  }

  const photos = form.getAll('photos').filter((v): v is File => v instanceof File);
  if (photos.length === 0) {
    return jsonError('photos required', 400, { error_code: 'no_files' });
  }
  if (photos.length > 6) {
    return jsonError('Maksimal 6 file per upload. Pisah jadi beberapa upload ya.', 400, {
      error_code: 'too_many_files',
    });
  }

  for (const p of photos) {
    const isImage = IMAGE_TYPES.has(p.type);
    const isPdf = p.type === PDF_TYPE;
    if (!isImage && !isPdf) {
      return jsonError(
        `Format ${p.type || 'tidak dikenal'} belum didukung. Pakai JPG, PNG, WebP, atau PDF.`,
        400,
        { error_code: 'unsupported_type', file_name: p.name, type: p.type },
      );
    }
    if (isImage && p.size > IMAGE_MAX) {
      return jsonError(
        `Foto "${p.name}" terlalu besar (${(p.size / 1024 / 1024).toFixed(1)}MB). Maksimal 12MB — coba foto yang lebih kecil atau crop dulu.`,
        413,
        { error_code: 'image_too_large', file_name: p.name, size_bytes: p.size },
      );
    }
    if (isPdf && p.size > PDF_MAX) {
      return jsonError(
        `PDF "${p.name}" terlalu besar (${(p.size / 1024 / 1024).toFixed(1)}MB). Maksimal 32MB — pisah jadi beberapa PDF lebih kecil ya.`,
        413,
        { error_code: 'pdf_too_large', file_name: p.name, size_bytes: p.size },
      );
    }
  }

  const overallStart = Date.now();
  console.info('[extract-menu] start', {
    tenant_id: tenantId,
    files: photos.map((p) => ({ name: p.name, type: p.type, size_bytes: p.size })),
  });

  // Split each input file into Anthropic content blocks. PDFs become
  // many single-page documents; images become one block apiece.
  let allBlocks: Anthropic.ContentBlockParam[] = [];
  let allLabels: string[] = [];
  try {
    for (const file of photos) {
      const { blocks, pageLabels } = await buildBlocksForFile(file);
      allBlocks = allBlocks.concat(blocks);
      allLabels = allLabels.concat(pageLabels);
    }
  } catch (err) {
    console.error('[extract-menu] preprocessing failed', {
      tenant_id: tenantId,
      reason: (err as Error).message,
    });
    return jsonError(
      `Gagal menyiapkan file: ${(err as Error).message}. Coba foto/PDF lain atau pisah halaman.`,
      422,
      { error_code: 'preprocessing_failed', reason: (err as Error).message },
    );
  }

  if (allBlocks.length === 0) {
    return jsonError('Tidak ada halaman yang bisa diproses.', 422, {
      error_code: 'no_processable_pages',
    });
  }

  const anthropic = getAnthropic();
  const results = await mapWithLimit(allBlocks, PARALLEL_CAP, (block) =>
    extractOneBlock(anthropic, block),
  );

  const okMenus: ExtractedMenu[] = [];
  const failedPages: Array<{ label: string; reason: string; ms: number }> = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.ok) {
      okMenus.push(r.menu);
    } else {
      failedPages.push({ label: allLabels[i], reason: r.reason, ms: r.ms });
      // Per-page structured log so Vercel function logs are
      // diagnostic. Filter by tenant_id or reason to spot patterns
      // (e.g. "all timeouts" → bump timeout; "all no_categories" →
      // tweak vision prompt).
      console.warn('[extract-menu] page failed', {
        tenant_id: tenantId,
        page_label: allLabels[i],
        reason: r.reason,
        processing_ms: r.ms,
      });
    }
  }

  const total = allBlocks.length;
  const okCount = okMenus.length;
  const totalMs = Date.now() - overallStart;

  console.info('[extract-menu] done', {
    tenant_id: tenantId,
    pages_total: total,
    pages_ok: okCount,
    pages_failed: failedPages.length,
    total_ms: totalMs,
  });

  // Hard failure only when EVERY page failed. Otherwise return what
  // we got + a structured warning the client can show the user.
  if (okCount === 0) {
    // Pick a representative reason for the user-facing string. If
    // every failure is the same kind, say so specifically; otherwise
    // fall back to the generic "all pages failed" copy.
    const reasonSet = new Set(failedPages.map((f) => f.reason));
    let humanMessage: string;
    if (reasonSet.size === 1 && reasonSet.has('timeout')) {
      humanMessage =
        total > 1
          ? `Semua ${total} halaman timeout (>${PER_BLOCK_TIMEOUT_MS / 1000}s per halaman). Pisah PDF jadi beberapa file lebih kecil, atau coba foto JPG/PNG yang lebih jelas.`
          : `Halaman timeout (>${PER_BLOCK_TIMEOUT_MS / 1000}s). Coba foto yang lebih jelas atau format JPG/PNG.`;
    } else if (reasonSet.size === 1 && reasonSet.has('no_categories')) {
      humanMessage =
        total > 1
          ? `Tidak ada menu yang kebaca dari ${total} halaman. Pastikan halaman menampilkan daftar item + harga, bukan halaman cover atau gambar saja.`
          : 'Tidak ada menu yang kebaca dari halaman ini. Pastikan ada daftar item + harga, bukan halaman cover atau gambar saja.';
    } else {
      humanMessage =
        total > 1
          ? `Semua ${total} halaman gagal dibaca. Halaman gagal: ${failedPages.map((f) => f.label).join(', ')}. Coba foto lebih jelas atau pisah jadi beberapa file.`
          : 'Halaman gagal dibaca. Coba foto yang lebih jelas atau format JPG/PNG.';
    }
    return jsonError(humanMessage, 422, {
      error_code: 'all_pages_failed',
      failed_pages: failedPages,
      pages_total: total,
    });
  }

  const merged = mergeMenus(okMenus);
  const summary = {
    pages_total: total,
    pages_ok: okCount,
    pages_failed: failedPages.length,
    failed_labels: failedPages.map((f) => f.label),
    total_ms: totalMs,
  };
  const partialNote =
    okCount < total
      ? `${okCount} dari ${total} halaman terbaca. Halaman gagal: ${failedPages.map((f) => f.label).join(', ')}. Mau kirim ulang halaman itu?`
      : null;

  return NextResponse.json({
    ...merged,
    notes: [merged.notes, partialNote].filter(Boolean).join(' · ') || undefined,
    summary,
  });
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
