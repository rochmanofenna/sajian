// POST /api/sections/compile
//
// Re-runs the sanitizer + compile pipeline for a single custom section
// and persists the result. Callers supply `source_jsx` (raw AI output)
// and/or `slot_tree` (Phase-1 AST). Ownership is verified before any
// write; rate-limited to 10 compiles/min per tenant so a pathological
// source can't DOS the compiler.
//
// The trigger on storefront_sections automatically records a new
// version row on the UPDATE, so every successful compile (and every
// failure recorded as compile_status='...') is auditable in
// storefront_section_versions.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { compileSection } from '@/lib/storefront/compile';
import { sanitizeSlotTree, SanitizerError } from '@/lib/storefront/sanitizer';
import { allow } from '@/lib/ai/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z
  .object({
    section_id: z.string().uuid(),
    source_jsx: z.string().max(8000).optional(),
    slot_tree: z.unknown().optional(),
  })
  .refine((b) => b.source_jsx !== undefined || b.slot_tree !== undefined, {
    message: 'provide source_jsx or slot_tree',
  });

export async function POST(req: Request) {
  try {
    const { tenant, userId } = await requireOwnerOrThrow();
    const gate = allow('sections-compile', `t:${tenant.id}`, { max: 10, windowMs: 60_000 });
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak kompilasi. Tunggu sebentar.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const { section_id, source_jsx, slot_tree } = parsed.data;

    const service = createServiceClient();
    const { data: section, error: loadErr } = await service
      .from('storefront_sections')
      .select('id, tenant_id, type, current_version_id')
      .eq('id', section_id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!section) {
      return NextResponse.json({ error: 'section not found' }, { status: 404 });
    }
    if (section.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'not the owner of this section' }, { status: 403 });
    }
    if (section.type !== 'custom') {
      return NextResponse.json(
        { error: 'compile is only available on custom sections' },
        { status: 409 },
      );
    }

    // Tag the next write so the version trigger records source='ai' (or
    // 'owner' depending on who called) rather than the default.
    await service.rpc('sajian_set_version_source', {
      p_source: 'ai',
      p_created_by: userId,
    });

    // Slot-tree path: sanitize first; any throw writes the error to the
    // section without touching compiled_code.
    if (slot_tree !== undefined) {
      try {
        const tree = sanitizeSlotTree(slot_tree);
        const { error: upErr } = await service
          .from('storefront_sections')
          .update({
            slot_tree: tree,
            compile_status: 'ok',
            compile_error: null,
            compiled_at: new Date().toISOString(),
            // Slot-tree only — clear any stale compiled_code so the
            // renderer prefers the new tree.
            compiled_code: null,
            code_hash: null,
            source_jsx: null,
          })
          .eq('id', section_id);
        if (upErr) throw upErr;
        return NextResponse.json({ ok: true, path: 'slot_tree' });
      } catch (err) {
        if (err instanceof SanitizerError) {
          await service
            .from('storefront_sections')
            .update({
              compile_status: 'sanitizer_failed',
              compile_error: { stage: 'sanitizer', message: err.message, path: err.path, rule: err.rule },
              compiled_at: new Date().toISOString(),
            })
            .eq('id', section_id);
          return NextResponse.json(
            { ok: false, stage: 'sanitizer', error: { message: err.message, path: err.path, rule: err.rule } },
            { status: 400 },
          );
        }
        throw err;
      }
    }

    // JSX compile path.
    const result = await compileSection(source_jsx!);
    if (!result.ok) {
      await service
        .from('storefront_sections')
        .update({
          source_jsx: source_jsx!,
          compile_status: result.stage === 'sanitizer' ? 'sanitizer_failed' : 'compile_failed',
          compile_error: result.error,
          compiled_at: new Date().toISOString(),
          // Do NOT overwrite compiled_code here — the last-good
          // compilation (if any) is still what gets rendered.
        })
        .eq('id', section_id);
      return NextResponse.json({ ok: false, stage: result.stage, error: result.error }, { status: 400 });
    }

    if (result.path === 'slot_tree') {
      const { error: upErr } = await service
        .from('storefront_sections')
        .update({
          source_jsx: source_jsx!,
          slot_tree: result.tree,
          compiled_code: null,
          code_hash: null,
          compile_status: 'ok',
          compile_error: null,
          compiled_at: new Date().toISOString(),
        })
        .eq('id', section_id);
      if (upErr) throw upErr;
      return NextResponse.json({ ok: true, path: 'slot_tree' });
    }

    // Compiled path — persist the code + hash.
    const { error: upErr } = await service
      .from('storefront_sections')
      .update({
        source_jsx: source_jsx!,
        slot_tree: null,
        compiled_code: result.compiled_code,
        code_hash: result.code_hash,
        compile_status: 'ok',
        compile_error: null,
        compiled_at: new Date().toISOString(),
      })
      .eq('id', section_id);
    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      path: 'compiled',
      code_hash: result.code_hash,
      compile_ms: result.ms,
      bytes: result.compiled_code.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
