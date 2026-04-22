// PATCH /api/admin/menu/[id] — edit a single menu item (price, availability,
// description, name). ESB-backed tenants are blocked — their master menu
// lives in ESB, we'd have to push up there first.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const patchSchema = z
  .object({
    name: z.string().min(1).max(240).optional(),
    description: z.string().max(1000).optional(),
    price: z.number().int().nonnegative().optional(),
    is_available: z.boolean().optional(),
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
        { error: 'Menu ESB tidak bisa diedit di sini — ubah dari portal ESB.' },
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
      .from('menu_items')
      .update(parsed.data)
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
