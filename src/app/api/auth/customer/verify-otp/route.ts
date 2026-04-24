// POST /api/auth/customer/verify-otp
//
// Verifies the 6-digit code Supabase just delivered. On success we:
//   1. Call link_or_create_customer_account RPC to stamp a global
//      customer_accounts row (idempotent).
//   2. Upsert the per-tenant customers row so the junction exists
//      immediately — future order writes find it without another upsert.
// Cookie domain is tenant-scoped by the Supabase SSR client + our
// NEXT_PUBLIC_CUSTOMER_COOKIE_DOMAIN env (falls back to tenant subdomain).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getTenant } from '@/lib/tenant';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { mapAuthError } from '@/lib/auth/error-map';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email().max(320),
  code: z.string().min(4).max(10),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const email = parsed.data.email.trim().toLowerCase();
    const code = parsed.data.code.trim();

    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json(
        { error: 'Login hanya tersedia di subdomain toko.' },
        { status: 400 },
      );
    }

    const sb = await createServerClient();
    const { data, error } = await sb.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: mapAuthError(error, { method: 'email', stage: 'verify' }) },
        { status: 400 },
      );
    }

    const service = createServiceClient();
    const { data: account, error: accountErr } = await service.rpc(
      'link_or_create_customer_account',
      {
        p_auth_user_id: data.user.id,
        p_email: email,
        p_phone: (data.user.user_metadata as { phone?: string } | null)?.phone ?? null,
        p_name: (data.user.user_metadata as { name?: string } | null)?.name ?? null,
      },
    );
    if (accountErr || !account) {
      console.error('[customer-auth] account link failed', accountErr);
      return NextResponse.json({ error: 'Gagal menyimpan akun. Coba lagi.' }, { status: 500 });
    }
    const accountRow = account as { id: string; email: string; name: string | null };

    // Idempotent upsert of the per-tenant customers row. Some legacy
    // rows have no phone but the existing unique constraint is
    // (tenant_id, phone) — use a select-first / insert-if-missing so
    // we don't collide on null-phone uniqueness.
    const { data: existing } = await service
      .from('customers')
      .select('id, customer_account_id')
      .eq('tenant_id', tenant.id)
      .eq('customer_account_id', accountRow.id)
      .maybeSingle();
    if (!existing) {
      // Try to adopt a pre-existing row created by a guest order with
      // the same email (common flow: guest → post-checkout signup).
      const { data: byEmail } = await service
        .from('customers')
        .select('id, customer_account_id')
        .eq('tenant_id', tenant.id)
        .ilike('email', email)
        .maybeSingle();
      if (byEmail) {
        await service
          .from('customers')
          .update({ customer_account_id: accountRow.id })
          .eq('id', byEmail.id);
      } else {
        await service.from('customers').insert({
          tenant_id: tenant.id,
          email,
          customer_account_id: accountRow.id,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      customer: { id: accountRow.id, email: accountRow.email, name: accountRow.name },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
