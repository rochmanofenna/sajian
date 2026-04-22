// POST /api/admin/tenant/image?kind=logo — upload tenant logo.
// POST /api/admin/tenant/image?kind=hero — upload hero cover image.
// DELETE /api/admin/tenant/image?kind=logo|hero — clear the URL.
//
// Storage path:
//   tenants/{tenantId}/logo-{ts}.{ext}
//   tenants/{tenantId}/hero-{ts}.{ext}
// Old files are left in place (housekeeping swept later).

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
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

function extFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'jpg';
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const kind = parseKind(new URL(req.url));
    if (!kind) return badRequest('kind must be logo or hero');

    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return badRequest('photo field required');
    if (!ALLOWED.has(file.type)) return badRequest('photo must be jpeg/png/webp/svg');
    if (file.size > MAX_BYTES) return badRequest('photo must be < 5MB');

    const path = `tenants/${tenant.id}/${kind}-${Date.now()}.${extFor(file.type)}`;
    const supabase = createServiceClient();

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, buf, { contentType: file.type, upsert: true });
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
    return NextResponse.json({ tenant: data });
  } catch (err) {
    return errorResponse(err);
  }
}
