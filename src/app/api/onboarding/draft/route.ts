// DELETE /api/onboarding/draft
//
// Wipes the authenticated user's onboarding draft. Used by the "Mulai dari
// awal" escape hatch in /setup when a draft has contaminated data (wrong
// menu extracted, leftover from a prior failed launch, etc.). No cascade —
// only touches onboarding_drafts; live tenants and menu tables are
// untouched on purpose.

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse } from '@/lib/api/errors';

export async function DELETE() {
  try {
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const service = createServiceClient();
    const { error } = await service
      .from('onboarding_drafts')
      .delete()
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
