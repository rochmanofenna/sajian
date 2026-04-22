// POST /api/admin/categories — create a new menu category. sort_order is
// auto-assigned as max(existing)+1 so the new category lands at the bottom.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const createSchema = z.object({ name: z.string().min(1).max(120) }).strict();

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    if (tenant.pos_provider === 'esb') {
      return NextResponse.json(
        { error: 'Kategori ESB dikelola dari portal ESB.' },
        { status: 409 },
      );
    }
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const supabase = createServiceClient();

    const { data: siblings } = await supabase
      .from('menu_categories')
      .select('sort_order')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = (siblings?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('menu_categories')
      .insert({
        tenant_id: tenant.id,
        name: parsed.data.name,
        sort_order: nextOrder,
        is_active: true,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ category: data });
  } catch (err) {
    return errorResponse(err);
  }
}
