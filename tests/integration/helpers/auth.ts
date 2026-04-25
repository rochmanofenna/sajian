// Sign-in helper for tenant-isolation tests. Returns a Supabase
// client with the test user's access token bound — RLS policies
// resolve auth.uid() against this token.
//
// We use password sign-in (not magic link) since the integration
// suite is non-interactive. Test users have known passwords seeded
// by helpers/seed.ts.

import { createClient } from '@supabase/supabase-js';
import { getTestBranch } from './branch';

export async function signInAs(email: string, password: string): Promise<{
  accessToken: string;
  userId: string;
}> {
  const branch = getTestBranch();
  const sb = createClient(branch.apiUrl, branch.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`signIn(${email}) failed: ${error?.message ?? 'no session'}`);
  }
  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
  };
}
