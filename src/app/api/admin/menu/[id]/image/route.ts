// POST /api/admin/menu/[id]/image — upload a menu-item thumbnail to Storage
// and point image_url at the public URL. Multipart form with field `photo`.
//
// Storage path: `menu/{tenantId}/{itemId}-{ts}.{ext}`. The timestamp busts
// the CDN cache when owner replaces the image; we don't prune the old file
// (cheap to keep, housekeeping can sweep later).
//
// All uploads run through a shared Sharp pipeline: auto-rotate, resize to
// 800px max edge, strip EXIF, re-encode to JPEG at quality 82. A 5MB phone
// photo becomes ~120KB before we ever touch Supabase.
//
// DELETE /api/admin/menu/[id]/image — clear image_url (the Storage object
// itself is left in place; see above).

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { processUpload } from '@/lib/onboarding/image-pipeline';

// Upstream cap — after Sharp the output is tiny, but we reject huge uploads
// at the boundary so we never shovel a 50MB file into memory.
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    if (tenant.pos_provider === 'esb') {
      return NextResponse.json(
        { error: 'Menu ESB tidak bisa diedit di sini.' },
        { status: 409 },
      );
    }
    const { id } = await params;

    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return badRequest('photo field required');
    if (!ALLOWED.has(file.type)) return badRequest('Foto harus JPEG, PNG, atau WebP.');
    if (file.size > MAX_INPUT_BYTES) return badRequest('Foto terlalu besar (maks 8MB).');

    const supabase = createServiceClient();

    // Confirm the item belongs to this tenant before we spend a Storage op.
    const { data: item } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (!item) return badRequest('Item tidak ditemukan');

    const processed = await processUpload(file, { maxEdge: 800, format: 'jpeg' });
    const path = `menu/${tenant.id}/${id}-${Date.now()}.${processed.ext}`;

    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, processed.buffer, {
        contentType: processed.contentType,
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
    const imageUrl = pub.publicUrl;

    const { data: updated, error: patchErr } = await supabase
      .from('menu_items')
      .update({ image_url: imageUrl })
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();
    if (patchErr) throw new Error(patchErr.message);

    return NextResponse.json({ item: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const { id } = await params;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('menu_items')
      .update({ image_url: null })
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ item: data });
  } catch (err) {
    return errorResponse(err);
  }
}
