// Root `/`. Three branches in priority order:
//   1. Tenant launched + active → StorefrontHome (its own preview
//      branch handles re-setup edits via cookie)
//   2. No tenant row, BUT a valid preview cookie scoped to this
//      subdomain → DraftStorefront (live preview during onboarding,
//      reads from onboarding_drafts.draft)
//   3. Apex / unrecognized subdomain → MarketingHome
//
// Branch 2 is the live-during-onboarding preview path. Pre-fix, an
// unlaunched <slug>.sajian.app fell to MarketingHome — owners saw
// the Sajian landing inside their /setup iframe. Now the same iframe
// renders the in-progress draft, re-rendering on every chat turn via
// PreviewLiveReloadClient + postMessage('sajian:reload') from
// /setup. /menu /cart /checkout /akun stay tenant-gated; only `/`
// supports the draft path for v1.

import { getPublicTenant, getTenantSlug } from '@/lib/tenant';
import { getPreviewMode } from '@/lib/preview/mode';
import { createServiceClient } from '@/lib/supabase/service';
import { StorefrontHome } from '@/components/storefront/StorefrontHome';
import { DraftStorefront } from '@/components/storefront/DraftStorefront';
import { MarketingHome } from '@/components/marketing/MarketingHome';
import type { TenantDraft } from '@/lib/onboarding/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams;
  if (sp?.preview_token || sp?.preview) {
    // Drafts must never be indexed — they're transient and owner-only.
    return { robots: { index: false, follow: false } };
  }
  return {};
}

export default async function Home() {
  const tenant = await getPublicTenant();
  if (tenant) {
    return <StorefrontHome tenant={tenant} />;
  }

  // Branch 2: unlaunched subdomain. If the request carries a valid
  // preview cookie scoped to this slug, render the in-progress
  // draft. The cookie was set by the proxy from the iframe's
  // `?preview_token=` URL param when /setup minted the token.
  const slug = await getTenantSlug();
  if (slug) {
    // Pass slug-only "tenant" so getPreviewMode validates the
    // token's tenant_slug claim against the URL slug — prevents a
    // token minted for slug A from rendering slug B's draft.
    const preview = await getPreviewMode({ slug });
    if (preview) {
      const sb = createServiceClient();
      const { data, error } = await sb
        .from('onboarding_drafts')
        .select('user_id, draft')
        .eq('user_id', preview.draftId)
        .maybeSingle();
      if (!error && data) {
        const draft = (data.draft ?? {}) as TenantDraft;
        return (
          <DraftStorefront
            draftOwnerId={data.user_id as string}
            slug={slug}
            draft={draft}
          />
        );
      }
    }
  }

  return <MarketingHome />;
}
