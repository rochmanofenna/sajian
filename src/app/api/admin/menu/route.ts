// GET /api/admin/menu — owner's menu, grouped by category, for the dashboard
// editor. Pulls straight from public.menu_categories + menu_items (the
// sajian_native source of truth). ESB-backed tenants still edit their master
// menu in ESB for now — the admin editor renders read-only for them.

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/api/errors';
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
