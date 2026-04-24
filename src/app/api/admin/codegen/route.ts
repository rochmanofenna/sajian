// POST /api/admin/codegen — ops mutations driven by the ops dashboard.
// Every op is gated by admin_users (see requireAdminOperatorOrThrow).
//
// Ops:
//   toggle_tenant  { tenant_id, enabled }          → enable/disable flag
//   set_global     { enabled, reason? }            → flip kill switch
//   reset_breaker  { trip_id }                     → mark a trip row reset

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOperatorOrThrow } from '@/lib/admin/is-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { enableCodegen, disableCodegen, setGlobalKillSwitch } from '@/lib/feature-flags';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('toggle_tenant'),
    tenant_id: z.string().uuid(),
    enabled: z.boolean(),
  }),
  z.object({
    op: z.literal('set_global'),
    enabled: z.boolean(),
    reason: z.string().max(240).optional(),
  }),
  z.object({
    op: z.literal('reset_breaker'),
    trip_id: z.string().uuid(),
  }),
]);

export async function POST(req: Request) {
  try {
    const operator = await requireAdminOperatorOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const body = parsed.data;

    if (body.op === 'toggle_tenant') {
      if (body.enabled) {
        await enableCodegen(body.tenant_id, 'admin');
      } else {
        await disableCodegen(body.tenant_id, `admin:${operator.email ?? operator.userId}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.op === 'set_global') {
      if (!body.enabled && (!body.reason || body.reason.trim().length === 0)) {
        return badRequest('reason required to disable globally');
      }
      await setGlobalKillSwitch({
        enabled: body.enabled,
        reason: body.reason ?? '',
        by: `admin:${operator.email ?? operator.userId}`,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.op === 'reset_breaker') {
      const service = createServiceClient();
      const { error } = await service
        .from('codegen_circuit_trips')
        .update({
          reset_at: new Date().toISOString(),
          reset_by: operator.email ?? operator.userId,
        })
        .eq('id', body.trip_id)
        .is('reset_at', null);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return badRequest('unknown op');
  } catch (err) {
    return errorResponse(err);
  }
}
