// GET /api/admin/menu — owner's menu, grouped by category, for the dashboard
// editor. Pulls straight from public.menu_categories + menu_items (the
// sajian_native source of truth). ESB-backed tenants still edit their master
// menu in ESB for now — the admin editor renders read-only for them.
//
// POST /api/admin/menu — create a new item under a category. Server validates
// the payload, assigns next sort_order, returns the inserted row.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

interface DBItem {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  tags: string[] | null;
}

interface DBCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const supabase = createServiceClient();

    const [{ data: cats, error: catErr }, { data: items, error: itemErr }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id, name, sort_order, is_active')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('id, category_id, name, description, price, image_url, is_available, sort_order, tags')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true }),
    ]);

    if (catErr) throw new Error(catErr.message);
    if (itemErr) throw new Error(itemErr.message);

    const cats_ = (cats ?? []) as DBCategory[];
    const items_ = (items ?? []) as DBItem[];

    const grouped = cats_.map((c) => ({
      ...c,
      items: items_.filter((it) => it.category_id === c.id),
    }));

    const orphaned = items_.filter((it) => !cats_.some((c) => c.id === it.category_id));

    return NextResponse.json({
      readonly: tenant.pos_provider === 'esb',
      categories: grouped,
      orphaned,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z
  .object({
    category_id: z.string().uuid(),
    name: z.string().min(1).max(240),
    description: z.string().max(1000).optional().nullable(),
    price: z.number().int().nonnegative(),
  })
  .strict();

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    if (tenant.pos_provider === 'esb') {
      return NextResponse.json(
        { error: 'Menu ESB tidak bisa diedit di sini — ubah dari portal ESB.' },
        { status: 409 },
      );
    }
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const supabase = createServiceClient();

    // Verify the category belongs to this tenant.
    const { data: cat } = await supabase
      .from('menu_categories')
      .select('id')
      .eq('id', parsed.data.category_id)
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (!cat) return badRequest('Kategori tidak ditemukan');

    // Next sort_order for the category.
    const { data: siblings } = await supabase
      .from('menu_items')
      .select('sort_order')
      .eq('tenant_id', tenant.id)
      .eq('category_id', parsed.data.category_id)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = (siblings?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        tenant_id: tenant.id,
        category_id: parsed.data.category_id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        price: parsed.data.price,
        is_available: true,
        sort_order: nextOrder,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ item: data });
  } catch (err) {
    return errorResponse(err);
  }
}
