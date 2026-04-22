// PATCH /api/admin/orders/[id] — owner-gated merchant status update. Only
// the authenticated owner of the tenant that owns this order can mutate it.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const patchSchema = z.object({
  status: z.enum(['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']).optional(),
  payment_status: z.enum(['pending', 'paid', 'failed', 'expired', 'refunded']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return badRequest('Invalid status values');

    const { tenant } = await requireOwnerOrThrow();
    const supabase = createServiceClient();

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === 'ready') patch.ready_at = new Date().toISOString();
    if (parsed.data.status === 'completed') patch.completed_at = new Date().toISOString();
    if (parsed.data.status === 'confirmed') patch.confirmed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ order: data });
  } catch (err) {
    return errorResponse(err);
  }
}
