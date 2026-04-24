// POST /api/ai/generate-logo
//
// Generates 3 logo options for an Indonesian restaurant. Preferred path uses
// OpenAI DALL-E 3 for professional imagery; falls back to Claude SVG when
// OPENAI_API_KEY isn't set (dev / staging without billing) so the flow still
// works end-to-end.
//
// Response shape:
//   { logos: string[] }        // 1-3 public URLs, first is recommended
//   { logos: [url], svg }      // fallback: single Claude SVG rasterized to PNG
//
// Each logo is persisted to `assets/user-<uid>/logos/<nanoid>.png` so the URL
// survives the 1-hour OpenAI URL expiry.

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { getAnthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { getOpenAI, hasOpenAI, downloadImage } from '@/lib/ai/openai';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 90;

interface Body {
  name: string;
  foodType?: string;
  primaryColor?: string;
}

// Claude occasionally wraps its SVG in commentary — pluck the svg block.
function extractSvg(raw: string): string | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

function buildLogoPrompt(body: Body, styleHint: string): string {
  const colorLine = body.primaryColor
    ? `Use ${body.primaryColor} as the primary brand color.`
    : 'Pick a warm, earthy primary color that suits Indonesian F&B.';
  const foodLine = body.foodType
    ? `Cuisine / concept: ${body.foodType} (let it inspire the symbol).`
    : '';
  // Image models (DALL·E 3 included) garble text — "BURGGER", "BURGIGER",
  // etc. Generate an ICON-ONLY mark and let the frontend render the
  // restaurant name with real CSS typography next to it. This is how
  // professional brands actually compose a lockup anyway.
  //
  // DALL·E 3 ignores negative prompts ~20% of the time, so we ALSO run a
  // vision-based text detector downstream and drop any output that
  // contains readable text.
  return `Design a professional restaurant brand ICON. ${foodLine} ${colorLine}
Style: ${styleHint}.

CRITICAL: absolutely NO text of any kind in the image.
- NO letters, NO words, NO numbers, NO writing, NO typography, NO slogans, NO taglines, NO establishment dates, NO watermarks, NO signage strings, NO captions, NO menu text.
- If you are tempted to draw a word, draw the subject of that word instead (e.g., instead of writing "BURGER" draw a burger; instead of writing "COFFEE" draw a coffee cup).
- The canvas must read as a pure symbol or glyph. A typographer would look at this and say "there is not a single letterform here."

Composition:
- Icon-only mark — like a polished app icon, sticker, or monogram-free glyph.
- Centered, crisp, clean background (solid color or subtle gradient).
- Readable at 32px (favicon) and 512px (sign). Vector-clean silhouette.
- Looks designed by a professional branding agency, NOT clip art, NOT AI-scraped stock imagery.`;
}

// DALL·E 3 ignores the "no text" instruction often enough that we can't
// trust it alone. Ask GPT-4o's vision endpoint whether the generated image
// contains readable letters or numbers. Returns true when the image is
// clean (or when the check itself errors — we fail-open so a moderation
// outage doesn't wipe out the whole logo picker).
async function isTextFree(
  openai: ReturnType<typeof import('@/lib/ai/openai').getOpenAI>,
  imageUrl: string,
): Promise<boolean> {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Does this image contain any readable text, letters, numbers, or words? Reply with exactly one word: YES or NO.',
            },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
        },
      ],
    });
    const answer = (res.choices[0]?.message?.content ?? '').trim().toUpperCase();
    return answer.startsWith('NO');
  } catch (err) {
    console.warn('[generate-logo] text-detection skipped:', err);
    return true;
  }
}

const STYLE_HINTS = [
  'modern minimalist, geometric, flat design',
  'hand-drawn artisan, warm and friendly, organic shapes',
  'bold and iconic, strong typography, confident palette',
];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.name || body.name.trim().length < 2) return badRequest('name required');

    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const gate = allow('ai-generate-logo', `u:${user.id}`, AI_RATE_PROFILES.logo);
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan logo. Coba lagi sebentar lagi.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
      );
    }

    const service = createServiceClient();

    // Preferred: DALL-E 3 produces three variants in parallel. Each is
    // downloaded, vision-checked for stray text, and stashed in Supabase
    // so the 1-hour OpenAI URLs don't matter — the owner can revisit the
    // options later in /setup. Options that fail the text check are
    // regenerated up to 2 additional times before we give up on them.
    if (hasOpenAI()) {
      const openai = getOpenAI();

      async function generateOne(hint: string, attempt = 1): Promise<string | null> {
        const gen = await openai.images.generate({
          model: 'dall-e-3',
          prompt: buildLogoPrompt(body, hint),
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid',
        });
        const url = gen.data?.[0]?.url;
        if (!url) return null;
        const clean = await isTextFree(openai, url);
        if (!clean && attempt < 3) {
          console.warn(
            `[generate-logo] text detected on ${hint} attempt ${attempt}, regenerating`,
          );
          return generateOne(hint, attempt + 1);
        }
        return url;
      }

      const urls = (await Promise.allSettled(STYLE_HINTS.map((h) => generateOne(h))))
        .filter(
          (r): r is PromiseFulfilledResult<string | null> =>
            r.status === 'fulfilled' && Boolean(r.value),
        )
        .map((r) => r.value as string);

      const logos: string[] = [];
      for (const url of urls) {
        try {
          const buf = await downloadImage(url);
          const path = `user-${user.id}/logos/${nanoid()}.png`;
          const { error: upErr } = await service.storage
            .from('assets')
            .upload(path, buf, { contentType: 'image/png', upsert: false });
          if (upErr) {
            console.error('[generate-logo] storage upload failed:', upErr.message);
            continue;
          }
          const { data: pub } = service.storage.from('assets').getPublicUrl(path);
          logos.push(pub.publicUrl);
        } catch (err) {
          console.error('[generate-logo] persist failed:', err);
        }
      }

      if (logos.length > 0) {
        return NextResponse.json({ logos, logo_url: logos[0] });
      }
      // If every DALL-E call failed, fall through to Claude as a last
      // resort so the user isn't left with a blank logo slot.
      console.warn('[generate-logo] all DALL-E calls failed, falling back to Claude SVG');
    }

    // Fallback path: Claude SVG. Lower visual quality but always available,
    // so staging / preview envs without an OpenAI key still produce something.
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

    const png = await sharp(Buffer.from(svg))
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const path = `user-${user.id}/logos/${nanoid()}.png`;
    const { error: upErr } = await service.storage.from('assets').upload(path, png, {
      contentType: 'image/png',
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = service.storage.from('assets').getPublicUrl(path);
    return NextResponse.json({ logos: [pub.publicUrl], logo_url: pub.publicUrl, svg });
  } catch (err) {
    return errorResponse(err);
  }
}
