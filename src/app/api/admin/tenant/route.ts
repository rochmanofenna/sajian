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
import {
  TENANT_SETTINGS,
  applySettingValue,
  SettingValidationError,
} from '@/lib/tenant-settings/registry';

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

// Build the registry-driven settings shape automatically. Each
// SettingDefinition contributes a `<key>` accepted by PATCH; PATCH
// then routes the value through applySettingValue() so transforms
// (e.g. percent → bps) run before the column write.
const settingsShape = TENANT_SETTINGS.reduce<Record<string, z.ZodTypeAny>>(
  (acc, def) => {
    acc[def.key] = def.schema.optional();
    return acc;
  },
  {},
);

const patchSchema = z
  .object({
    name: z.string().min(1).max(240).optional(),
    tagline: z.string().max(240).nullable().optional(),
    logo_url: z.string().url().nullable().optional(),
    hero_image_url: z.string().url().nullable().optional(),
    colors: colorsSchema.optional(),
    operating_hours: z.record(z.string(), hoursDaySchema).nullable().optional(),
    theme_template: z.enum(THEME_TEMPLATES as [string, ...string[]]).optional(),
    ...settingsShape,
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

    // Build the storage patch by hand so registry-driven keys go
    // through applySettingValue (which maps key→column + applies the
    // transform). Non-registry fields (name/tagline/logo/colors/etc)
    // pass through unchanged.
    const patch: Record<string, unknown> = {};
    const registryKeys = new Set(TENANT_SETTINGS.map((d) => d.key));
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      if (registryKeys.has(k)) {
        try {
          const { column, value } = applySettingValue(k, v);
          patch[column] = value;
        } catch (err) {
          if (err instanceof SettingValidationError) {
            return badRequest(`${k}: ${err.detail ?? err.reason}`);
          }
          throw err;
        }
      } else {
        patch[k] = v;
      }
    }
    // Merge colors rather than overwrite, so the client can send only
    // the fields it wants to change.
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
