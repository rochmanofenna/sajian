// /setup/history — version-history admin page. Gates on an active
// Supabase session + tenant context; otherwise redirects to /setup
// where the login UX is centralized. Rendered inside the onboarding
// layout so the owner keeps the same chrome.

import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { VersionHistory } from '@/components/onboarding/VersionHistory';

export const dynamic = 'force-dynamic';

export default async function SetupHistoryPage() {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/setup');
  return <VersionHistory />;
}
