// POST /api/admin/tenant/deactivate — soft-delete: set is_active=false so the
// public storefront returns 404, customer-facing RLS stops exposing it, but
// nothing is actually destroyed. Re-activation is currently support-only.

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('tenants')
      .update({ is_active: false })
      .eq('id', tenant.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
