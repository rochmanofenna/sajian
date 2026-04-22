// Draft preview route. The setup page embeds this in an iframe. We fetch the
// user's current draft for the initial paint, then the client component
// subscribes to postMessage events from the parent so subsequent edits don't
// require a page reload.
//
// Service-role client bypasses RLS so the iframe doesn't need the owner's
// auth cookie forwarded — the caller's userId is the only key.

import { createServiceClient } from '@/lib/supabase/service';
import type { TenantDraft } from '@/lib/onboarding/types';
import { PreviewClient } from '@/components/preview/PreviewClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function PreviewPage({ params }: Props) {
  const { userId } = await params;

  const sb = createServiceClient();
  const { data } = await sb
    .from('onboarding_drafts')
    .select('draft')
    .eq('user_id', userId)
    .maybeSingle();

  const initial = (data?.draft ?? {}) as TenantDraft;
  return <PreviewClient initial={initial} />;
}
