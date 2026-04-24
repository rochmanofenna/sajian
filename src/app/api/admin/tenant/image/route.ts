// POST /api/admin/tenant/image?kind=logo — upload tenant logo.
// POST /api/admin/tenant/image?kind=hero — upload hero cover image.
// DELETE /api/admin/tenant/image?kind=logo|hero — clear the URL.
//
// Storage path:
//   tenants/{tenantId}/logo-{ts}.{ext}
//   tenants/{tenantId}/hero-{ts}.{ext}
// Uploads run through Sharp to right-size them before they reach Supabase:
// logos fit inside 512px, heroes inside 1600px, EXIF stripped, re-encoded
// to JPEG at quality 82. SVGs pass through unchanged (already vector).
// Old files are left in place (housekeeping swept later).

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { processUpload } from '@/lib/onboarding/image-pipeline';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

type Kind = 'logo' | 'hero';

function parseKind(url: URL): Kind | null {
  const kind = url.searchParams.get('kind');
  if (kind === 'logo' || kind === 'hero') return kind;
  return null;
}

function columnFor(kind: Kind): 'logo_url' | 'hero_image_url' {
  return kind === 'logo' ? 'logo_url' : 'hero_image_url';
}

function maxEdgeFor(kind: Kind): number {
  return kind === 'logo' ? 512 : 1600;
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const kind = parseKind(new URL(req.url));
    if (!kind) return badRequest('kind must be logo or hero');

    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return badRequest('photo field required');
    if (!ALLOWED.has(file.type)) return badRequest('Foto harus JPEG, PNG, WebP, atau SVG.');
    if (file.size > MAX_INPUT_BYTES) return badRequest('Foto terlalu besar (maks 8MB).');

    const processed = await processUpload(file, {
      maxEdge: maxEdgeFor(kind),
      format: 'jpeg',
    });
    const path = `tenants/${tenant.id}/${kind}-${Date.now()}.${processed.ext}`;

    const supabase = createServiceClient();
    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, processed.buffer, {
        contentType: processed.contentType,
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
    const url = pub.publicUrl;

    const col = columnFor(kind);
    const { data, error } = await supabase
      .from('tenants')
      .update({ [col]: url })
      .eq('id', tenant.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    revalidatePath('/', 'layout');

    return NextResponse.json({ tenant: data, url });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const kind = parseKind(new URL(req.url));
    if (!kind) return badRequest('kind must be logo or hero');

    const supabase = createServiceClient();
    const col = columnFor(kind);
    const { data, error } = await supabase
      .from('tenants')
      .update({ [col]: null })
      .eq('id', tenant.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    revalidatePath('/', 'layout');

    return NextResponse.json({ tenant: data });
  } catch (err) {
    return errorResponse(err);
  }
}
