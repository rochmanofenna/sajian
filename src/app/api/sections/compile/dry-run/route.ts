// POST /api/sections/compile/dry-run
//
// Runs the sanitizer + compile pipeline on supplied source_jsx WITHOUT
// persisting anything. Useful for the codegen eval harness + any
// tooling that needs to validate generated JSX against the live
// pipeline's exact rules (sanitizer version + primitive allowlist).
//
// Gated by the codegen feature flag like the real compile route: we
// don't want an owner with codegen disabled probing the sanitizer for
// rule discovery. Rate-limited independently of the real compile loop.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { compileSection } from '@/lib/storefront/compile';
import { allow } from '@/lib/ai/rate-limit';
import { isCodegenEnabled } from '@/lib/feature-flags';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  source_jsx: z.string().min(1).max(8000),
});

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    if (!(await isCodegenEnabled(tenant.id))) {
      return NextResponse.json({ error: 'codegen_disabled' }, { status: 403 });
    }
    const gate = allow('sections-compile-dryrun', `t:${tenant.id}`, {
      max: 30,
      windowMs: 60_000,
    });
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak dry-run. Tunggu sebentar.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
      );
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const result = await compileSection(parsed.data.source_jsx);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, stage: result.stage, error: result.error },
        { status: 400 },
      );
    }
    if (result.path === 'slot_tree') {
      return NextResponse.json({ ok: true, path: 'slot_tree' });
    }
    return NextResponse.json({
      ok: true,
      path: 'compiled',
      code_hash: result.code_hash,
      bytes: result.compiled_code.length,
      compile_ms: result.ms,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
