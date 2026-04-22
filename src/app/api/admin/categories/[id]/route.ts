// PATCH /api/admin/categories/[id] — rename a category or change its
// sort_order (up/down reorder from the UI).
//
// DELETE /api/admin/categories/[id] — cascade delete: items first, then the
// category row. FK is `on delete set null` so items would survive as
// orphaned; we explicitly want them gone when the owner says "Hapus kategori
// dan semua item di dalamnya".

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    sort_order: z.number().int().nonnegative().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    if (tenant.pos_provider === 'esb') {
      return NextResponse.json(
        { error: 'Kategori ESB dikelola dari portal ESB.' },
        { status: 409 },
      );
    }
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('menu_categories')
      .update(parsed.data)
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ category: data });
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
    if (tenant.pos_provider === 'esb') {
      return NextResponse.json(
        { error: 'Kategori ESB tidak bisa dihapus di sini.' },
        { status: 409 },
      );
    }
    const { id } = await params;
    const supabase = createServiceClient();

    // Delete child items first (FK is set-null, so this is a deliberate
    // cascade, not the default).
    const { error: itemErr } = await supabase
      .from('menu_items')
      .delete()
      .eq('category_id', id)
      .eq('tenant_id', tenant.id);
    if (itemErr) throw new Error(itemErr.message);

    const { error } = await supabase
      .from('menu_categories')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
