// GET /api/menu?branch=MCE&orderType=takeaway[&memberCode=...]
//
// Resolves visitPurposeID dynamically from /qsv1/setting/branch.orderModes —
// NEVER hardcoded. For ESB tenants the menu comes straight from ESB so prices
// stay live; for sajian_native tenants we read from Supabase menu_items.

import { NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/api/tenant-api';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { ESBClient } from '@/lib/esb/client';
import { visitPurposeFor } from '@/lib/esb/client';
import type { ESBBranchSettings } from '@/lib/esb/types';

type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const branch = url.searchParams.get('branch');
    const orderType = url.searchParams.get('orderType') as OrderType | null;
    const memberCode = url.searchParams.get('memberCode') ?? undefined;

    if (!branch) return badRequest('branch is required');
    if (!orderType || !['dine_in', 'takeaway', 'delivery'].includes(orderType)) {
      return badRequest('orderType must be dine_in|takeaway|delivery');
    }

    const tenant = await resolveTenant();

    if (tenant.pos_provider === 'esb') {
      const esb = new ESBClient(tenant);
      const settings = (await esb.getBranchSettings(branch)) as
        | ESBBranchSettings
        | { data?: ESBBranchSettings };
      const visitPurpose = visitPurposeFor(settings, orderType);
      if (!visitPurpose) {
        return badRequest(`Branch ${branch} does not support ${orderType}`);
      }
      const menu = await esb.getMenu(branch, visitPurpose, memberCode);
      return NextResponse.json({ source: 'esb', visitPurpose, menu });
    }

    const supabase = createServiceClient();
    const [{ data: cats }, { data: items }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id, name, description, sort_order')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('menu_items')
        .select('id, category_id, name, description, price, image_url, modifiers, tags, sort_order')
        .eq('tenant_id', tenant.id)
        .eq('is_available', true)
        .order('sort_order'),
    ]);

    // Mirror ESB's two-level shape so the storefront can render both sources
    // with the same tree walk.
    return NextResponse.json({
      source: 'sajian_native',
      menu: {
        menuCategories: (cats ?? []).map((c, ci) => ({
          menuCategoryID: ci,
          menuCategoryCode: c.id,
          menuCategoryDesc: c.name,
          menuCategoryDetails: [
            {
              menuCategoryDetailID: ci,
              menuCategoryDetailDesc: c.name,
              flagSoldOut: false,
              menus: (items ?? [])
                .filter((i) => i.category_id === c.id)
                .map((i, mi) => ({
                  menuID: Number.isFinite(Number(i.id)) ? Number(i.id) : mi,
                  menuName: i.name,
                  price: i.price,
                  sellPrice: i.price,
                  imageUrl: i.image_url ?? undefined,
                  description: i.description ?? undefined,
                  flagSoldOut: false,
                })),
            },
          ],
        })),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
