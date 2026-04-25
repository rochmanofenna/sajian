// GET /api/branches?lat=&lng= — distance-sorted branches for the active tenant.
//
// For ESB-backed tenants we merge Supabase branch rows (for slug/address/coords
// metadata we control) with ESB's branch list (authoritative for isOpen /
// distance). ESB's list is keyed by branch code, which is also our
// `branches.code` column — that's how we join.

import { NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/api/tenant-api';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { ESBClient } from '@/lib/esb/client';

interface ESBBranchesEnvelope {
  data?: Array<{
    branchCode?: string;
    branchName?: string;
    distance?: number;
    isOpen?: boolean;
    isTemporaryClosed?: boolean;
    latitude?: number;
    longitude?: number;
  }>;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    // lat/lng are now OPTIONAL — when absent we still return the full
    // active-branch list so single-branch tenants resolve their only
    // branch without geolocation. ESB enrichment (distance / isOpen)
    // gracefully degrades when the coords are missing.

    const tenant = await resolveTenant();
    const supabase = createServiceClient();

    const { data: rows, error } = await supabase
      .from('branches')
      .select('id, name, code, address, coords, supports_dine_in, supports_takeaway, supports_delivery, sort_order')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw new Error(error.message);

    // For sajian_native we're done — just return Supabase rows, no distance.
    if (tenant.pos_provider !== 'esb') {
      return NextResponse.json({
        branches: (rows ?? []).map((r) => ({
          code: r.code,
          name: r.name,
          address: r.address,
          supportsDineIn: r.supports_dine_in,
          supportsTakeaway: r.supports_takeaway,
          supportsDelivery: r.supports_delivery,
        })),
      });
    }

    // ESB path: enrich with isOpen + distance from ESB's branch list.
    // Skip the call when coords are missing — distance only matters for
    // multi-branch tenants and a single-branch tenant doesn't need it.
    const esb = new ESBClient(tenant);
    let esbList: ESBBranchesEnvelope['data'] = [];
    if (lat && lng) {
      try {
        const resp = (await esb.getBranches(lat, lng)) as ESBBranchesEnvelope | ESBBranchesEnvelope['data'];
        esbList = Array.isArray(resp) ? resp : resp?.data ?? [];
      } catch (err) {
        // ESB fallback — still return rows, just without live status.
        console.warn('[api/branches] ESB getBranches failed, returning Supabase rows only:', err);
      }
    }

    const esbByCode = new Map((esbList ?? []).map((b) => [b.branchCode ?? '', b]));

    const merged = (rows ?? []).map((r) => {
      const live = esbByCode.get(r.code);
      return {
        code: r.code,
        name: r.name,
        address: r.address,
        supportsDineIn: r.supports_dine_in,
        supportsTakeaway: r.supports_takeaway,
        supportsDelivery: r.supports_delivery,
        distanceKm: live?.distance,
        isOpen: live?.isOpen !== false && live?.isTemporaryClosed !== true,
      };
    });

    // Sort by live distance when available, fall back to sort_order.
    merged.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return 0;
    });

    return NextResponse.json({ branches: merged });
  } catch (err) {
    return errorResponse(err);
  }
}
