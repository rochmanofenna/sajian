// GET /api/onboarding/seed-from-live
//
// Returns a complete TenantDraft snapshot of the authenticated user's live
// tenant — everything the /setup preview needs (name, tagline, colors, logo,
// hero, theme, operating hours, categories + items including sold-out ones).
//
// Why this exists as a server route instead of a client-side Supabase query:
//   · Browser anon-client RLS on menu_items filters `is_available=false` and
//     other inactive rows, so the owner's re-setup preview came back empty
//     even though the live menu has 100+ items.
//   · Nested PostgREST embeds (`menu_items(...)`) can also silently drop
//     rows that fail either table's RLS — hard to debug from the client.
//   · Service client bypasses RLS, and we verify ownership server-side via
//     the auth cookie, so privacy is still enforced.

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';
import type { CategoryDraft, MenuItemDraft, TenantDraft } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DBItem {
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_available: boolean;
  tags: string[] | null;
  sort_order: number;
  category_id: string | null;
}

interface DBCategory {
  id: string;
  name: string;
  sort_order: number;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }

    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: tenant, error: tenantErr } = await service
      .from('tenants')
      .select(
        'id, slug, name, tagline, colors, theme_template, logo_url, hero_image_url, operating_hours, pos_provider, owner_user_id',
      )
      .eq('slug', slug)
      .maybeSingle();
    if (tenantErr) throw new Error(tenantErr.message);
    if (!tenant) {
      return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
    }
    if (tenant.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'not the owner of this tenant' }, { status: 403 });
    }

    const [{ data: cats, error: catErr }, { data: items, error: itemErr }] = await Promise.all([
      service
        .from('menu_categories')
        .select('id, name, sort_order')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true }),
      service
        .from('menu_items')
        .select('category_id, name, price, description, image_url, is_available, tags, sort_order')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true }),
    ]);
    if (catErr) throw new Error(catErr.message);
    if (itemErr) throw new Error(itemErr.message);

    const cats_ = (cats ?? []) as DBCategory[];
    const items_ = (items ?? []) as DBItem[];

    const menuCategories: CategoryDraft[] = cats_.map((c) => ({
      name: c.name,
      items: items_
        .filter((i) => i.category_id === c.id)
        .map<MenuItemDraft>((i) => ({
          name: i.name,
          description: i.description ?? '',
          price: i.price,
          image_url: i.image_url,
          is_available: i.is_available,
          tags: i.tags ?? [],
        })),
    }));

    const draft: TenantDraft = {
      name: tenant.name as string,
      slug: tenant.slug as string,
      tagline: (tenant.tagline as string | null) ?? undefined,
      colors: (tenant.colors as TenantDraft['colors']) ?? undefined,
      theme_template: (tenant.theme_template as TenantDraft['theme_template']) ?? undefined,
      logo_url: (tenant.logo_url as string | null) ?? null,
      hero_image_url: (tenant.hero_image_url as string | null) ?? null,
      operating_hours: (tenant.operating_hours as TenantDraft['operating_hours']) ?? undefined,
      pos_provider: (tenant.pos_provider as TenantDraft['pos_provider']) ?? undefined,
      menu_categories: menuCategories,
    };

    return NextResponse.json({
      draft,
      stats: {
        categories: menuCategories.length,
        items: items_.length,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
