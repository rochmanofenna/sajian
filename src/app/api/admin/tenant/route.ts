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
import { revalidatePath } from 'next/cache';
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
  open: z.string().optional(),
  close: z.string().optional(),
  closed: z.boolean().optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(1).max(240).optional(),
    tagline: z.string().max(240).nullable().optional(),
    logo_url: z.string().url().nullable().optional(),
    hero_image_url: z.string().url().nullable().optional(),
    colors: colorsSchema.optional(),
    operating_hours: z.record(z.string(), hoursDaySchema).nullable().optional(),
    theme_template: z.enum(THEME_TEMPLATES as [string, ...string[]]).optional(),
    // Owners can toggle their store on/off from the inactive panel. Soft-
    // delete still lives at /api/admin/tenant/deactivate.
    is_active: z.boolean().optional(),
    // AI-editable settings (Phase 5 settings actions). Whitelisted
    // here so update_tenant_setting can route through the same PATCH
    // endpoint owners use from /admin → Store Settings.
    multi_branch_mode: z.boolean().nullable().optional(),
    currency_symbol: z.string().min(1).max(8).optional(),
    locale: z.string().min(2).max(16).optional(),
    support_whatsapp: z.string().max(32).nullable().optional(),
    contact_email: z.string().email().max(240).nullable().optional(),
    // Typography. Null reverts to the template default. The font name
    // must match a Google Fonts family — the storefront layout loads
    // it dynamically via the Google Fonts CSS endpoint.
    heading_font_family: z.string().trim().min(1).max(80).nullable().optional(),
    body_font_family: z.string().trim().min(1).max(80).nullable().optional(),
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

    // Tenant data fans out across the storefront SSR + admin shell + iframe
    // preview. Invalidating the layout is a big hammer but it's the only way
    // to guarantee a fresh render for the customer after the owner changes
    // colors/name/hours. Costs are negligible at our traffic.
    revalidatePath('/', 'layout');

    return NextResponse.json({ tenant: data });
  } catch (err) {
    return errorResponse(err);
  }
}
