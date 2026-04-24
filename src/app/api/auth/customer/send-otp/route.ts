// POST /api/auth/customer/send-otp
//
// Issues a 6-digit Supabase email OTP to the visitor. Privacy-preserving
// — we never reveal whether the email already exists. Rate limited per
// email + per IP to stop enumeration + spam.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { allow } from '@/lib/ai/rate-limit';
import { clientIp } from '@/lib/api/auth';
import { mapAuthError } from '@/lib/auth/error-map';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email().max(320),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const email = parsed.data.email.trim().toLowerCase();

    // 5/hour per email — stops a single address from DOSing Supabase.
    const emailGate = allow('customer-otp-email', `e:${email}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!emailGate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan untuk email ini. Tunggu 1 jam.' },
        { status: 429, headers: { 'Retry-After': String(emailGate.retryAfter) } },
      );
    }

    // 20/hour per IP — blocks enumeration sweeps.
    const ipGate = allow('customer-otp-ip', `i:${clientIp(req)}`, {
      max: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipGate.ok) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan dari perangkat ini.' },
        { status: 429, headers: { 'Retry-After': String(ipGate.retryAfter) } },
      );
    }

    const sb = await createServerClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // Role metadata lets us distinguish customer sessions from owner
        // sessions even if cookie scoping is ever misconfigured.
        data: { role: 'customer' },
      },
    });
    if (error) {
      // Rate-limit / provider errors get the same copy pipeline as the
      // owner flow so "Signups not allowed for otp" etc. read in
      // Indonesian.
      return NextResponse.json(
        { error: mapAuthError(error, { method: 'email', stage: 'send' }) },
        { status: 400 },
      );
    }
    // Always return 200 regardless of whether the user existed — we
    // don't leak account existence to anonymous callers.
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
