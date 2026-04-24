// POST /api/ai/generate-food-photo
//
// Generates a single photorealistic food photo for one menu item via DALL-E 3.
// Used from the onboarding MenuEditor and admin MenuEditor to fill in photos
// for restaurants that don't have their own. Owner can always upload a real
// photo instead; this is the "good enough so the menu doesn't look bare" path.
//
// Request:  { itemName, description?, category? }
// Response: { image_url }                  — public URL in the assets bucket
// Errors:
//   401 unauthorized
//   429 rate-limited
//   503 service unavailable (OPENAI_API_KEY not configured)

import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { allow, AI_RATE_PROFILES } from '@/lib/ai/rate-limit';
import { getOpenAI, hasOpenAI, downloadImage } from '@/lib/ai/openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
  itemName: string;
  description?: string;
  category?: string;
}

function buildPrompt(body: Body): string {
  const desc = body.description?.trim() ? `Description: ${body.description.trim()}.` : '';
  const cat = body.category?.trim() ? `Category: ${body.category.trim()}.` : '';
  return `Professional food photography of "${body.itemName}". ${desc} ${cat}

Requirements:
- Top-down or 45-degree angle, like a professional menu photo.
- Beautifully plated on a clean plate or bowl.
- Soft natural lighting, slight depth-of-field blur on edges.
- Indonesian / Southeast Asian food styling where appropriate.
- Warm, appetizing colors — make the viewer hungry.
- Clean background (wooden table, marble, or neutral surface).
- No text, watermarks, or overlays.
- Photorealistic, NOT illustrated or cartoon.
- Single serving portion, centered in frame.`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.itemName || body.itemName.trim().length < 2) {
      return badRequest('itemName required');
    }

    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const gate = allow('ai-generate-food-photo', `u:${user.id}`, AI_RATE_PROFILES.logo);
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
      size: '1024x1024',
      quality: 'standard',
      style: 'natural',
    });
    const url = response.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: 'Foto gagal dibuat, coba lagi.' }, { status: 502 });
    }

    const raw = await downloadImage(url);
    // Resize to 800px — matches the menu-item upload pipeline so the
    // storefront doesn't have to deal with size drift between owner uploads
    // and AI-generated photos.
    const optimized = await sharp(raw)
      .resize(800, 800, { fit: 'cover' })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();

    const service = createServiceClient();
    const path = `user-${user.id}/menu-ai/${nanoid()}.jpg`;
    const { error: upErr } = await service.storage
      .from('assets')
      .upload(path, optimized, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = service.storage.from('assets').getPublicUrl(path);
    return NextResponse.json({ image_url: pub.publicUrl });
  } catch (err) {
    console.error('[generate-food-photo] failed', err);
    return errorResponse(err);
  }
}
