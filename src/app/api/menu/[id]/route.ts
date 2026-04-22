// GET /api/menu/[id]?branch=MCE&orderType=takeaway — item detail
// (variants, modifier groups, full description). ESB-only for now; sajian_native
// returns the stored row without extras.

import { NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/api/tenant-api';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { ESBClient, visitPurposeFor } from '@/lib/esb/client';
import type { ESBBranchSettings } from '@/lib/esb/types';

type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const branch = url.searchParams.get('branch');
    const orderType = url.searchParams.get('orderType') as OrderType | null;
    if (!branch) return badRequest('branch is required');
    if (!orderType) return badRequest('orderType is required');

    const tenant = await resolveTenant();

    if (tenant.pos_provider === 'esb') {
      const esb = new ESBClient(tenant);
      const settings = (await esb.getBranchSettings(branch)) as
        | ESBBranchSettings
        | { data?: ESBBranchSettings };
      const visitPurpose = visitPurposeFor(settings, orderType);
      if (!visitPurpose) return badRequest(`Branch ${branch} does not support ${orderType}`);
      const detail = await esb.getMenuDetail(branch, visitPurpose, id);
      return NextResponse.json({ source: 'esb', detail });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ source: 'sajian_native', detail: data });
  } catch (err) {
    return errorResponse(err);
  }
}
