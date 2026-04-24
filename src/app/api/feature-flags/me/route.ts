// GET /api/feature-flags/me — returns the current tenant's codegen
// flag plus the global state. Used by the "Mode lanjutan" toggle in
// the Store settings page to render the current state without
// requiring a full page reload after a flip.

import { NextResponse } from 'next/server';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { isCodegenEnabled, isGlobalCodegenEnabled } from '@/lib/feature-flags';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const [globalEnabled, effective, flagRow] = await Promise.all([
      isGlobalCodegenEnabled(),
      isCodegenEnabled(tenant.id),
      (async () => {
        const service = createServiceClient();
        const { data } = await service
          .from('feature_flags')
          .select('codegen_enabled, codegen_enabled_at, codegen_enabled_by')
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        return data;
      })(),
    ]);
    return NextResponse.json({
      tenant_id: tenant.id,
      codegen_enabled: effective,
      codegen_enabled_for_tenant: Boolean(flagRow?.codegen_enabled),
      codegen_enabled_at: flagRow?.codegen_enabled_at ?? null,
      codegen_enabled_by: flagRow?.codegen_enabled_by ?? null,
      codegen_globally_enabled: globalEnabled,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
