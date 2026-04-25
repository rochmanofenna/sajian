// PATCH /api/admin/roadmap-requests/[id] — flip status + add note.
// Sajian operator only (admin_users gate). The /admin/roadmap page
// uses this to mark requests as planned / in_progress / shipped /
// wont_do as the team triages.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOperatorOrThrow } from '@/lib/admin/is-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const patchSchema = z
  .object({
    status: z.enum(['open', 'planned', 'in_progress', 'shipped', 'wont_do']).optional(),
    resolved_note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOperatorOrThrow();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const service = createServiceClient();
    const { data, error } = await service
      .from('roadmap_requests')
      .update(parsed.data)
      .eq('id', id)
      .select('id, ai_categorization, status, upvote_count, resolved_note')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ request: data });
  } catch (err) {
    return errorResponse(err);
  }
}
