// POST /api/admin/menu/[id]/image — upload a menu-item thumbnail to Storage
// and point image_url at the public URL. Multipart form with field `photo`.
//
// Storage path: `menu/{tenantId}/{itemId}-{ts}.{ext}`. The timestamp busts
// the CDN cache when owner replaces the image; we don't prune the old file
// (cheap to keep, housekeeping can sweep later).
//
// DELETE /api/admin/menu/[id]/image — clear image_url (the Storage object
// itself is left in place; see above).

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_BYTES = 3 * 1024 * 1024; // 3MB — menu thumbnails don't need more.
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
    if (!ALLOWED.has(file.type)) return badRequest('photo must be jpeg, png, or webp');
    if (file.size > MAX_BYTES) return badRequest('photo must be < 3MB');

    const supabase = createServiceClient();

    // Confirm the item belongs to this tenant before we spend a Storage op.
    const { data: item } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (!item) return badRequest('Item tidak ditemukan');

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `menu/${tenant.id}/${id}-${Date.now()}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, buf, { contentType: file.type, upsert: true });
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
