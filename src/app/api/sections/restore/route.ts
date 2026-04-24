// POST /api/sections/restore
//
// Restores a section to a prior version. The underlying RPC
// sajian_restore_section_version inserts a NEW version with the target
// content (append-only lineage). For custom sections we re-run
// compileSection afterwards so compiled_code reflects the current
// sanitizer + compiler version, not the one that was active when the
// target version was originally persisted.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { compileSection } from '@/lib/storefront/compile';

export const runtime = 'nodejs';

const bodySchema = z.object({
  section_id: z.string().uuid(),
  version_id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const { section_id, version_id } = parsed.data;

    const service = createServiceClient();

    // Confirm ownership + load the target version in one round trip.
    const { data: section, error: sErr } = await service
      .from('storefront_sections')
      .select('id, tenant_id, type')
      .eq('id', section_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!section || section.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const { data: target, error: tErr } = await service
      .from('storefront_section_versions')
      .select('version_number, section_id')
      .eq('id', version_id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target || target.section_id !== section_id) {
      return NextResponse.json({ error: 'version mismatch' }, { status: 400 });
    }

    // Pull the target content directly (so we can pass it to the RPC
    // and, for custom sections, feed source_jsx back into compile).
    const { data: targetContent, error: contentErr } = await service
      .from('storefront_section_versions')
      .select('type, variant, sort_order, props, is_visible, source_jsx, slot_tree')
      .eq('id', version_id)
      .maybeSingle();
    if (contentErr) throw new Error(contentErr.message);
    if (!targetContent) {
      return NextResponse.json({ error: 'target missing' }, { status: 404 });
    }

    await service.rpc('sajian_restore_section_version', {
      p_section_id: section_id,
      p_target_version_id: version_id,
      p_type: targetContent.type,
      p_variant: targetContent.variant,
      p_props: targetContent.props ?? {},
      p_sort_order: targetContent.sort_order,
      p_is_visible: targetContent.is_visible,
    });

    // For custom sections, re-run compile against the stored source_jsx
    // so compiled_code reflects the current sanitizer / compiler
    // versions. Old compiled output might be stale after a compiler
    // bump and fail at render time.
    if (targetContent.type === 'custom' && targetContent.source_jsx) {
      const result = await compileSection(targetContent.source_jsx as string);
      if (result.ok && result.path === 'compiled') {
        await service
          .from('storefront_sections')
          .update({
            source_jsx: targetContent.source_jsx,
            slot_tree: null,
            compiled_code: result.compiled_code,
            code_hash: result.code_hash,
            compile_status: 'ok',
            compile_error: null,
            compiled_at: new Date().toISOString(),
          })
          .eq('id', section_id);
      } else if (result.ok && result.path === 'slot_tree') {
        await service
          .from('storefront_sections')
          .update({
            source_jsx: targetContent.source_jsx,
            slot_tree: result.tree,
            compiled_code: null,
            code_hash: null,
            compile_status: 'ok',
            compile_error: null,
            compiled_at: new Date().toISOString(),
          })
          .eq('id', section_id);
      }
      // If re-compile fails we leave the RPC-restored fields in place;
      // the custom-section renderer falls back to slot_tree or the
      // "sedang disiapkan" card and the owner can edit forward.
    }

    return NextResponse.json({ ok: true, version_number: target.version_number });
  } catch (err) {
    return errorResponse(err);
  }
}
