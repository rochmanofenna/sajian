// Helpers for the /admin/codegen operator surface. Distinct from the
// per-tenant owner auth in src/lib/admin/auth.ts — admin_users is a
// table of Sajian staff, checked by user.id regardless of tenant.

import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export interface AdminOperator {
  userId: string;
  email: string | null;
}

export async function getAdminOperatorOrNull(): Promise<AdminOperator | null> {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function requireAdminOperatorOrThrow(): Promise<AdminOperator> {
  const op = await getAdminOperatorOrNull();
  if (!op) {
    const err = new Error('NOT_ADMIN');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return op;
}
