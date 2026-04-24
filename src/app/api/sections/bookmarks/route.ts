// POST   /api/sections/bookmarks        — pin a version with a label
// DELETE /api/sections/bookmarks?id=... — remove a bookmark
//
// Bookmarks are owner-scoped; the RLS policy from migration 013
// enforces that even if the service-role writes slip past us.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const postSchema = z.object({
  version_id: z.string().uuid(),
  label: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  try {
    const { tenant, userId } = await requireOwnerOrThrow();
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const service = createServiceClient();

    // Confirm the target version belongs to a section owned by this tenant.
    const { data: version } = await service
      .from('storefront_section_versions')
      .select('id, section_id')
      .eq('id', parsed.data.version_id)
      .maybeSingle();
    if (!version) return NextResponse.json({ error: 'version not found' }, { status: 404 });

    const { data: section } = await service
      .from('storefront_sections')
      .select('id, tenant_id')
      .eq('id', version.section_id)
      .maybeSingle();
    if (!section || section.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const { data, error } = await service
      .from('storefront_section_bookmarks')
      .upsert(
        {
          tenant_id: tenant.id,
          version_id: parsed.data.version_id,
          label: parsed.data.label,
          created_by: userId,
        },
        { onConflict: 'version_id' },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, bookmark: data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const service = createServiceClient();
    const { error } = await service
      .from('storefront_section_bookmarks')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
