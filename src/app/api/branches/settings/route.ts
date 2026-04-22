// GET /api/branches/settings?branch=MCE — full ESB branch settings.
// Used by the checkout flow to discover visitPurposeID per order type and
// supported payment methods. Cached 5m — these don't change often.

import { NextResponse } from 'next/server';
import { resolveESBTenant } from '@/lib/api/tenant-api';
import { errorResponse, badRequest } from '@/lib/api/errors';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const branch = url.searchParams.get('branch');
    if (!branch) return badRequest('branch is required');

    const { esb } = await resolveESBTenant();
    const settings = await esb.getBranchSettings(branch);
    return NextResponse.json(settings, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
