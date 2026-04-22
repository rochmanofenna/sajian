// POST /api/ai/generate-logo
//
// Claude generates a simple SVG logo for restaurants that don't have one.
// We rasterize to PNG, upload to Supabase Storage `assets` bucket under
// user-<uid>/logos/<nanoid>.png, and return the public URL.

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { getAnthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
  name: string;
  foodType?: string;
  primaryColor?: string;
}

// Extract just the <svg>...</svg> block. Claude sometimes wraps it in text.
function extractSvg(raw: string): string | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.name || body.name.trim().length < 2) return badRequest('name required');

    // Must be authenticated — we scope uploads to the user's folder.
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Generate a simple, clean SVG logo for an Indonesian restaurant named "${body.name}"${
            body.foodType ? ` that sells ${body.foodType}` : ''
          }.

Requirements:
- 200x200 viewBox, no external images, no external fonts.
- Use ${body.primaryColor ?? '#1B5E3B'} as the primary color.
- Minimalist and modern. Works at 16px (favicon) and 512px (header).
- Include the restaurant name in a clean sans-serif. Use an SVG <text> with a system font stack: font-family="-apple-system, system-ui, sans-serif".
- Optionally include a small food-related icon.
- Return ONLY the raw SVG code starting with <svg. No explanation, no markdown.`,
        },
      ],
    });

    const raw = res.content[0].type === 'text' ? res.content[0].text : '';
    const svg = extractSvg(raw);
    if (!svg) return NextResponse.json({ error: 'Gagal bikin logo, coba lagi.' }, { status: 422 });

    const png = await sharp(Buffer.from(svg)).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

    const path = `user-${user.id}/logos/${nanoid()}.png`;
    const service = createServiceClient();
    const { error: upErr } = await service.storage.from('assets').upload(path, png, {
      contentType: 'image/png',
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = service.storage.from('assets').getPublicUrl(path);
    return NextResponse.json({ logo_url: pub.publicUrl, svg });
  } catch (err) {
    return errorResponse(err);
  }
}
