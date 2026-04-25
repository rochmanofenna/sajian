// Owner + AI-driven roadmap request log.
//
//   GET  /api/admin/roadmap-requests          — owner reads their own
//   POST /api/admin/roadmap-requests          — log a new request
//
// POST is what the AI's log_roadmap_request action calls. Owners can
// also see their own pending requests on /admin (future tab) so they
// know the team has heard them. Sajian operators get the cross-tenant
// dashboard at /admin/roadmap.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const ALLOWED_CATEGORIES = [
  'modifiers',
  'loyalty',
  'reservations',
  'gift_cards',
  'subscriptions',
  'multi_currency',
  'inventory',
  'integrations',
  'other',
] as const;

const bodySchema = z.object({
  category: z.enum(ALLOWED_CATEGORIES),
  workaround_offered: z.string().trim().max(2000).optional(),
  raw_user_message: z.string().trim().min(1).max(2000),
});

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const service = createServiceClient();
    const { data, error } = await service
      .from('roadmap_requests')
      .select(
        'id, ai_categorization, raw_user_message, workaround_offered, upvote_count, status, created_at',
      )
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ requests: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { tenant, userId } = await requireOwnerOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }

    const service = createServiceClient();
    // Bump existing open row in same bucket if the user / category /
    // tenant matches — keeps the dashboard from drowning in dupes
    // when the AI logs the same ask across multiple turns. Match by
    // exact raw message lowercased so genuinely-different asks still
    // create separate rows.
    const messageKey = parsed.data.raw_user_message.trim().toLowerCase();
    const { data: existing } = await service
      .from('roadmap_requests')
      .select('id, upvote_count')
      .eq('tenant_id', tenant.id)
      .eq('ai_categorization', parsed.data.category)
      .eq('status', 'open')
      .ilike('raw_user_message', messageKey)
      .maybeSingle();

    if (existing?.id) {
      const { data: bumped, error: bumpErr } = await service
        .from('roadmap_requests')
        .update({
          upvote_count: (existing.upvote_count as number) + 1,
          workaround_offered: parsed.data.workaround_offered ?? null,
        })
        .eq('id', existing.id)
        .select('id, ai_categorization, status, upvote_count')
        .single();
      if (bumpErr) throw bumpErr;
      return NextResponse.json({ request: bumped, mode: 'bumped' });
    }

    const { data, error } = await service
      .from('roadmap_requests')
      .insert({
        tenant_id: tenant.id,
        requester_user_id: userId,
        ai_categorization: parsed.data.category,
        raw_user_message: parsed.data.raw_user_message,
        workaround_offered: parsed.data.workaround_offered ?? null,
      })
      .select('id, ai_categorization, status')
      .single();
    if (error) throw error;
    return NextResponse.json({ request: data, mode: 'created' });
  } catch (err) {
    return errorResponse(err);
  }
}
