// Owner-gated delivery-zone admin.
//   GET  /api/admin/delivery-zones — list active zones for the tenant
//   POST /api/admin/delivery-zones — add a zone
//
// Per-row update + delete live at /api/admin/delivery-zones/[id].

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  fee_cents: z.number().int().min(0).max(10_000_000),
  radius_km: z.number().min(0).max(200).optional().nullable(),
});

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_delivery_zones')
      .select('id, name, fee_cents, radius_km, is_active, sort_order, created_at')
      .eq('tenant_id', tenant.id)
      .order('sort_order')
      .order('created_at');
    if (error) throw error;
    return NextResponse.json({ zones: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const service = createServiceClient();
    const { data, error } = await service
      .from('tenant_delivery_zones')
      .insert({
        tenant_id: tenant.id,
        name: parsed.data.name,
        fee_cents: parsed.data.fee_cents,
        radius_km: parsed.data.radius_km ?? null,
      })
      .select('id, name, fee_cents, radius_km, is_active')
      .single();
    if (error) throw error;
    revalidatePath('/', 'layout');
    return NextResponse.json({ zone: data });
  } catch (err) {
    return errorResponse(err);
  }
}
