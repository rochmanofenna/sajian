// Owner-gated tenant editing. PATCH /api/admin/tenant.
//
// Accepts a partial update body. The allowlist below is the only thing that
// ever gets written — anything else (pos_config, owner_*, subscription_tier)
// is silently dropped so a misbehaving client can't escalate.
//
// The GET variant returns the FULL tenant row (no stripping) so the dashboard
// can show current values as it loads the form. Safe because the handler is
// already owner-gated.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { THEME_TEMPLATES } from '@/lib/tenant';

const colorsSchema = z
  .object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    dark: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .partial();

const hoursDaySchema = z.object({
  open: z.string(),
  close: z.string(),
});

const patchSchema = z
  .object({
    tagline: z.string().max(240).nullable().optional(),
    logo_url: z.string().url().nullable().optional(),
    hero_image_url: z.string().url().nullable().optional(),
    colors: colorsSchema.optional(),
    operating_hours: z.record(z.string(), hoursDaySchema).nullable().optional(),
    theme_template: z.enum(THEME_TEMPLATES as [string, ...string[]]).optional(),
  })
  .strict();

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    return NextResponse.json({ tenant });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const json = await req.json();
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    // Merge colors rather than overwrite, so the client can send only the
    // fields it wants to change.
    if (parsed.data.colors) {
      patch.colors = { ...tenant.colors, ...parsed.data.colors };
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('tenants')
      .update(patch)
      .eq('id', tenant.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ tenant: data });
  } catch (err) {
    return errorResponse(err);
  }
}
