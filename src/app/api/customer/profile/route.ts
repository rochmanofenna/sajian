// PATCH /api/customer/profile — update the signed-in customer's
// global account (name + phone). Email changes require re-verification
// so they live on a separate endpoint (Phase-after).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTenant } from '@/lib/tenant';
import { getCustomerSession } from '@/lib/auth/customer-session';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(32).optional(),
});

export async function PATCH(req: Request) {
  try {
    const tenant = await getTenant();
    const session = await getCustomerSession(tenant);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, account: session.account });
    }
    const service = createServiceClient();
    const { data, error } = await service
      .from('customer_accounts')
      .update(patch)
      .eq('id', session.account.id)
      .select('id, email, phone, name')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, account: data });
  } catch (err) {
    return errorResponse(err);
  }
}
