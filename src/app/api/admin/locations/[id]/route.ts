// PATCH/DELETE /api/admin/locations/[id]
//
// Per-row update/delete for branches. Owner-gated; service-client
// bypasses RLS but enforces tenant_id == owner.tenant.id explicitly
// before each write.

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
    address: z.string().trim().max(400).nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
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
      .from('branches')
      .update(parsed.data)
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select('id, name, code, address, phone, is_active')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    revalidatePath('/', 'layout');
    return NextResponse.json({ location: data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const { id } = await params;
    const service = createServiceClient();
    // Soft-delete: flip is_active. Hard delete cascades to orders /
    // menu rows we don't want to lose. Owners can re-enable from
    // /admin → Settings if they tap delete by accident.
    const { data, error } = await service
      .from('branches')
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
