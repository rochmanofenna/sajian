// POST /api/onboarding/preview-token
//
// Mints a short-lived (15-min) JWT the /setup iframe attaches to the
// tenant subdomain URL so the storefront renders the draft instead of
// the published current_version. Owner-gated; the token binds to
// (draft_id, owner_user_id, tenant_slug). The storefront re-verifies
// the binding on every render so a stolen token doesn't escape its
// tenant.
//
// Body: { tenant_slug: string }   — slug the owner wants to preview
// Returns: { token, expires_at, preview_url } — preview_url already
//   includes the slug + token so the client can drop it straight into
//   the iframe src.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { signPreviewToken } from '@/lib/preview/token';
import { errorResponse, badRequest } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tenant_slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'invalid slug'),
});

function tenantPreviewUrl(slug: string, draftId: string, token: string): string {
  // The app origin governs whether prod uses https://<slug>.sajian.app
  // or http://<slug>.localhost:3000. Localhost dev keeps subdomains via
  // /etc/hosts entries the docs already require.
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, '') ?? 'https://sajian.app';
  let host: string;
  try {
    const u = new URL(appOrigin);
    if (u.hostname === 'sajian.app' || u.hostname === 'www.sajian.app') {
      host = `${slug}.sajian.app`;
    } else if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      const port = u.port ? `:${u.port}` : '';
      host = `${slug}.localhost${port}`;
    } else {
      host = u.hostname;
    }
    return `${u.protocol}//${host}/?preview=${encodeURIComponent(draftId)}&preview_token=${encodeURIComponent(token)}`;
  } catch {
    return `https://${slug}.sajian.app/?preview=${encodeURIComponent(draftId)}&preview_token=${encodeURIComponent(token)}`;
  }
}

export async function POST(req: Request) {
  try {
    const sb = await createServerClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const slug = parsed.data.tenant_slug;

    const service = createServiceClient();
    // Owner ↔ tenant binding. The same owner may have multiple tenants
    // someday; here we only allow them to mint a token for a tenant
    // they actually own, by slug.
    const { data: tenant } = await service
      .from('tenants')
      .select('slug, owner_user_id')
      .eq('slug', slug)
      .maybeSingle();
    // Pre-launch case: tenant row may not exist yet — fall through to
    // mint the token bound to slug only, the storefront still won't
    // render anything for an unlaunched slug, but the same /setup flow
    // wants a working preview URL while the tenant is still pending.
    if (tenant && tenant.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // onboarding_drafts.user_id is the primary key (one draft per
    // user). We use that uuid as the draft identifier in the token —
    // there's no separate `id` column to bind to. Auto-seed an empty
    // row when missing so the very first /setup load (and any post-
    // reset state) always has a draft for the iframe to render. The
    // storefront falls back to live data when sections are empty.
    const { error: upsertErr } = await service
      .from('onboarding_drafts')
      .upsert(
        { user_id: user.id },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    if (upsertErr) {
      // Non-fatal — if the row already existed under a race, the
      // upsert is a no-op. Surface anything else as a 500.
      console.error('[preview-token] draft upsert failed', upsertErr);
    }

    const draftId = user.id;
    const { token, expiresAt } = signPreviewToken({
      draftId,
      ownerUserId: user.id,
      tenantSlug: slug,
    });

    return NextResponse.json({
      token,
      expires_at: expiresAt,
      preview_url: tenantPreviewUrl(slug, draftId, token),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
