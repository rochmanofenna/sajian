// POST /api/onboarding/launch
//
// Reads the authenticated user's draft from onboarding_drafts, then calls
// the atomic onboarding_launch() RPC which creates the tenant + categories
// + items + default branch in one transaction. Returns the new slug.

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { generateSlug, isValidSlug } from '@/lib/onboarding/slug';
import type { TenantDraft } from '@/lib/onboarding/types';

export async function POST() {
  try {
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const service = createServiceClient();
    const { data: draftRow, error: draftErr } = await service
      .from('onboarding_drafts')
      .select('draft')
      .eq('user_id', user.id)
      .maybeSingle();
    if (draftErr) throw draftErr;
    if (!draftRow?.draft) return badRequest('no draft to launch');

    const draft = draftRow.draft as TenantDraft;

    if (!draft.name) return badRequest('nama restoran belum diisi');
    if (!draft.menu_categories || draft.menu_categories.length === 0) {
      return badRequest('menu belum diisi');
    }

    // Derive slug if the chat didn't set one.
    const slug = draft.slug && isValidSlug(draft.slug) ? draft.slug : generateSlug(draft.name);
    if (!isValidSlug(slug)) return badRequest('slug invalid');

    const payload: TenantDraft = {
      ...draft,
      slug,
      pos_provider: draft.pos_provider ?? 'sajian_native',
    };

    const { data, error } = await service.rpc('onboarding_launch', {
      p_user_id: user.id,
      p_phone: user.phone ?? user.email ?? null,
      p_draft: payload,
    });

    if (error) {
      if (error.message.includes('slug taken')) {
        return NextResponse.json({ error: 'Nama sudah dipakai. Coba nama lain.' }, { status: 409 });
      }
      throw error;
    }

    const result = data as { tenant_id: string; slug: string };
    return NextResponse.json({
      tenant_id: result.tenant_id,
      slug: result.slug,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
