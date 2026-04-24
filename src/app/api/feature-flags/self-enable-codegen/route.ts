// POST /api/feature-flags/self-enable-codegen
//
// Owner self-service: flip codegen_enabled on for the caller's tenant
// (source = self_opt_in). Disallowed when the global kill switch is
// off — owners can't bypass an operator-triggered halt. Disable is a
// separate POST with body { enable: false } for symmetry; most owners
// will only ever flip it on via the /setup settings toggle.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import {
  enableCodegen,
  disableCodegen,
  isGlobalCodegenEnabled,
} from '@/lib/feature-flags';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const bodySchema = z.object({
  enable: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }

    if (parsed.data.enable && !(await isGlobalCodegenEnabled())) {
      return NextResponse.json(
        {
          error:
            'Mode lanjutan sementara dimatikan di seluruh sistem. Coba lagi nanti.',
        },
        { status: 409 },
      );
    }

    if (parsed.data.enable) {
      await enableCodegen(tenant.id, 'self_opt_in');
    } else {
      await disableCodegen(tenant.id, 'self_opt_out');
    }

    return NextResponse.json({ ok: true, codegen_enabled: parsed.data.enable });
  } catch (err) {
    return errorResponse(err);
  }
}
