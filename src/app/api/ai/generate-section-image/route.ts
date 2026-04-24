// POST /api/ai/generate-section-image
//
// Generates a section hero / gallery / background image via DALL-E 3.
// Used by the chat's `generate_section_image` action — e.g. "bikin foto
// hero suasana restoran" updates the hero section's background.
//
// Request:  { section_type: SectionType; prompt?: string; extra?: string }
// Response: { image_url }          — public URL in the assets bucket
// Errors:
//   401 unauthorized
//   429 rate-limited
//   503 service unavailable (OPENAI_API_KEY not configured)
//
// The route composes a safe prompt per section type so owners can say
// "bikin foto suasana" without needing to remember DALL-E prompt craft.

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';
import { getOpenAI, hasOpenAI, downloadImage } from '@/lib/ai/openai';
import { isKnownSection } from '@/lib/storefront/section-registry';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
  section_type: string;
  // Free-form brief from the owner ("suasana hangat, kayu").
  prompt?: string;
  // Optional extra context the caller already knows (tenant name, cuisine).
  extra?: string;
}

function buildPrompt(body: Body): string {
  const extra = body.extra?.trim() ?? '';
  const brief = body.prompt?.trim() ?? '';
  const base =
    'Photorealistic lifestyle photography. No text, no watermarks, no overlays. Warm, inviting, editorial feel.';

  switch (body.section_type) {
    case 'hero':
      return `Wide hero image for a restaurant storefront: interior vignette, soft natural light, warm editorial colors. ${base} Brief: ${brief || 'cozy dining ambience'}. ${extra}`;
    case 'gallery':
      return `Single gallery still — close-up of food, hands plating, or candid atmosphere. Shallow depth of field. ${base} Brief: ${brief || 'menu item close-up'}. ${extra}`;
    case 'about':
      return `Documentary-style shot of the restaurant team, kitchen detail, or signature dish prep. Warm tones. ${base} Brief: ${brief || 'owner at work in the kitchen'}. ${extra}`;
    case 'promo':
      return `Eye-catching promotional backdrop — ingredients arranged flat-lay on a wooden surface, dramatic light. No text. ${base} Brief: ${brief || 'signature dish overhead flat lay'}. ${extra}`;
    case 'social':
      return `Instagram-worthy candid shot that fits a restaurant social feed: food, guest enjoying a meal, or a menu detail. ${base} Brief: ${brief || 'guest enjoying signature dish'}. ${extra}`;
    default:
      return `Generic storefront lifestyle image. ${base} Brief: ${brief || 'warm restaurant atmosphere'}. ${extra}`;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.section_type || !isKnownSection(body.section_type)) {
      return badRequest('section_type invalid');
    }

    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const gate = allow('ai-generate-section-image', `u:${user.id}`, AI_RATE_PROFILES.logo);
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan foto. Coba lagi sebentar lagi.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
      );
    }

    if (!hasOpenAI()) {
      return NextResponse.json(
        { error: 'Foto AI belum aktif. Hubungi support atau upload foto sendiri.' },
        { status: 503 },
      );
    }

    const openai = getOpenAI();
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: buildPrompt(body),
      n: 1,
      size: body.section_type === 'hero' ? '1792x1024' : '1024x1024',
      quality: 'standard',
      style: 'natural',
    });
    const url = response.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: 'Foto gagal dibuat, coba lagi.' }, { status: 502 });
    }

    const raw = await downloadImage(url);
    // Hero gets wider output; everything else is square-ish. Cap long edge
    // at 1600px for storefront speed.
    const isHero = body.section_type === 'hero';
    const optimized = await sharp(raw)
      .resize(isHero ? 1600 : 1200, isHero ? 900 : 1200, { fit: 'cover' })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();

    const service = createServiceClient();
    const path = `user-${user.id}/sections/${body.section_type}-${nanoid()}.jpg`;
    const { error: upErr } = await service.storage
      .from('assets')
      .upload(path, optimized, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = service.storage.from('assets').getPublicUrl(path);
    return NextResponse.json({ image_url: pub.publicUrl });
  } catch (err) {
    console.error('[generate-section-image] failed', err);
    return errorResponse(err);
  }
}
