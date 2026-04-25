// PATCH/DELETE /api/admin/delivery-zones/[id]
//
// DELETE soft-deletes (is_active=false) so checkouts in flight don't
// orphan. PATCH updates name/fee/radius/is_active.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    fee_cents: z.number().int().min(0).max(10_000_000).optional(),
    radius_km: z.number().min(0).max(200).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_delivery_zones')
      .update(parsed.data)
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('id, name, fee_cents, radius_km, is_active')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    revalidatePath('/', 'layout');
    return NextResponse.json({ zone: data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const { id } = await params;
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_delivery_zones')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
