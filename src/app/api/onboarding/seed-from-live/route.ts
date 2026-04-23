// GET /api/onboarding/seed-from-live?slug=<slug>
//
// Returns a complete TenantDraft snapshot of the authenticated user's live
// tenant — everything the /setup preview needs. Branches on pos_provider:
//
//   • ESB tenants: menu comes from ESB's /qsv1/menu (Mindiology etc.). The
//     local menu_categories / menu_items tables are empty for these, which
//     is why the previous "query supabase" approach silently returned 0
//     items.
//   • sajian_native tenants: menu comes from Supabase tables.
//
// Service client bypasses RLS, and we verify ownership via the auth cookie.
// The response includes `source` and `stats` so the caller can tell the
// owner what happened (e.g. "12 kategori, 147 item" or "ESB menu — view
// only, edit di portal ESB").

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';
import { ESBClient, visitPurposeFor } from '@/lib/esb/client';
import type {
  ESBBranchSettings,
  ESBMenuResponse,
} from '@/lib/esb/types';
import type { Tenant } from '@/lib/tenant';
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
    const { data: tenantRow, error: tenantErr } = await service
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (tenantErr) throw new Error(tenantErr.message);
    if (!tenantRow) {
      return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
    }
    if (tenantRow.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'not the owner of this tenant' }, { status: 403 });
    }

    const tenant = tenantRow as Tenant;

    // Branch on pos_provider — ESB and native have different menu sources.
    let menuCategories: CategoryDraft[] = [];
    let source: 'esb' | 'native' = 'native';
    let esbWarning: string | null = null;

    if (tenant.pos_provider === 'esb') {
      source = 'esb';
      const esbResult = await fetchEsbMenu(tenant);
      menuCategories = esbResult.categories;
      esbWarning = esbResult.warning;
    } else {
      menuCategories = await fetchNativeMenu(service, tenant.id);
    }

    const draft: TenantDraft = {
      name: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline ?? undefined,
      colors: tenant.colors ?? undefined,
      theme_template: tenant.theme_template,
      logo_url: tenant.logo_url,
      hero_image_url: tenant.hero_image_url ?? null,
      operating_hours: (tenant.operating_hours as TenantDraft['operating_hours']) ?? undefined,
      pos_provider: tenant.pos_provider,
      menu_categories: menuCategories,
    };

    const itemCount = menuCategories.reduce((n, c) => n + c.items.length, 0);
    return NextResponse.json({
      draft,
      source,
      stats: { categories: menuCategories.length, items: itemCount },
      esbWarning,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// ─── Native (Supabase) menu ──────────────────────────────────────────────

async function fetchNativeMenu(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
): Promise<CategoryDraft[]> {
  const [{ data: cats, error: catErr }, { data: items, error: itemErr }] = await Promise.all([
    service
      .from('menu_categories')
      .select('id, name, sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true }),
    service
      .from('menu_items')
      .select('category_id, name, price, description, image_url, is_available, tags, sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true }),
  ]);
  if (catErr) throw new Error(catErr.message);
  if (itemErr) throw new Error(itemErr.message);

  const cats_ = (cats ?? []) as DBCategory[];
  const items_ = (items ?? []) as DBItem[];

  return cats_.map((c) => ({
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
}

// ─── ESB menu ────────────────────────────────────────────────────────────
//
// Walks menuCategories → menuCategoryDetails → menus, flattening the
// two-level ESB shape into one-level CategoryDraft (name + items). Items
// keep their current availability (flagSoldOut), price, and image.

async function fetchEsbMenu(
  tenant: Tenant,
): Promise<{ categories: CategoryDraft[]; warning: string | null }> {
  try {
    const branch = tenant.pos_config?.esb_default_branch;
    if (!branch) {
      return { categories: [], warning: 'Tenant ESB belum punya esb_default_branch di pos_config.' };
    }
    const esb = new ESBClient(tenant);

    const settingsRaw = (await esb.getBranchSettings(branch)) as
      | ESBBranchSettings
      | { data?: ESBBranchSettings };
    const settings: ESBBranchSettings =
      'data' in settingsRaw && settingsRaw.data
        ? settingsRaw.data
        : (settingsRaw as ESBBranchSettings);

    // Try takeaway first (most common), then dine_in, then delivery — we just
    // need SOME visitPurpose to pull the menu.
    const visitPurpose =
      visitPurposeFor(settings, 'takeaway') ??
      visitPurposeFor(settings, 'dine_in') ??
      visitPurposeFor(settings, 'delivery');
    if (!visitPurpose) {
      return {
        categories: [],
        warning: `Branch ${branch} tidak punya orderMode manapun — cek ESB settings.`,
      };
    }

    const menuRaw = (await esb.getMenu(branch, visitPurpose)) as
      | ESBMenuResponse
      | { data?: ESBMenuResponse };
    const menu: ESBMenuResponse =
      'data' in menuRaw && menuRaw.data ? menuRaw.data : (menuRaw as ESBMenuResponse);

    const categories: CategoryDraft[] = [];
    for (const cat of menu.menuCategories ?? []) {
      const items: MenuItemDraft[] = [];
      for (const detail of cat.menuCategoryDetails ?? []) {
        for (const m of detail.menus ?? []) {
          items.push({
            name: m.menuName,
            description: m.description ?? '',
            price: m.price,
            image_url: m.imageOptimUrl ?? m.imageUrl ?? m.imageThumbnailUrl ?? null,
            is_available: !m.flagSoldOut,
            tags: [],
          });
        }
      }
      if (items.length > 0) {
        categories.push({ name: cat.menuCategoryDesc, items });
      }
    }

    return { categories, warning: null };
  } catch (err) {
    // ESB can be flaky — surface the error so the UI can explain instead of
    // silently leaving the preview empty.
    const msg = err instanceof Error ? err.message : 'ESB error';
    return { categories: [], warning: `Gagal ambil menu dari ESB: ${msg}` };
  }
}
