// Owner-gated branches/locations admin.
//   GET   /api/admin/locations           — list active branches for the tenant
//   POST  /api/admin/locations           — add a branch
//
// Per-row update + delete live at /api/admin/locations/[id]. Slug-style
// codes are auto-generated from the location name when caller doesn't
// supply one, so the AI can call add_location with just a name.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(400).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/i)
    .optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'cabang';
}

export async function GET() {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const service = createServiceClient();
    const { data, error } = await service
      .from('branches')
      .select('id, name, code, address, phone, is_active, sort_order, created_at')
      .eq('tenant_id', tenant.id)
      .order('sort_order')
      .order('created_at');
    if (error) throw error;
    return NextResponse.json({ locations: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireOwnerOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const service = createServiceClient();

    // Resolve the code: caller-supplied wins, otherwise slugify name +
    // de-collide by suffixing -2, -3, … if needed.
    const baseCode = parsed.data.code?.toLowerCase() ?? slugify(parsed.data.name);
    const { data: existing } = await service
      .from('branches')
      .select('code')
      .eq('tenant_id', tenant.id)
      .ilike('code', `${baseCode}%`);
    const taken = new Set((existing ?? []).map((r) => (r.code as string).toLowerCase()));
    let finalCode = baseCode;
    let suffix = 2;
    while (taken.has(finalCode)) {
      finalCode = `${baseCode}-${suffix}`;
      suffix += 1;
    }

    const { data, error } = await service
      .from('branches')
      .insert({
        tenant_id: tenant.id,
        name: parsed.data.name,
        code: finalCode,
        address: parsed.data.address ?? null,
        phone: parsed.data.phone ?? null,
      })
      .select('id, name, code, address, phone, is_active')
      .single();
    if (error) throw error;
    revalidatePath('/', 'layout');
    return NextResponse.json({ location: data });
  } catch (err) {
    return errorResponse(err);
  }
}
