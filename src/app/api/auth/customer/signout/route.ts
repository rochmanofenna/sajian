// POST /api/auth/customer/signout — signs out the current customer
// session on this tenant subdomain.

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const sb = await createServerClient();
    await sb.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
