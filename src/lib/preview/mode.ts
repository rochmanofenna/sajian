// Preview-mode resolver. Reads the request's preview cookie or the
// search param the iframe URL carries on first load, verifies the
// JWT, confirms the tenant_slug binding matches, and returns a
// `PreviewMode` storefront server components consume to swap their
// data source from published storefront_sections to the live draft.
//
// The cookie is what makes intra-iframe navigation work — once set on
// the tenant subdomain, every subsequent /menu, /cart, /checkout
// request sees the same preview without the parent rewriting links.

import { cookies } from 'next/headers';
import { verifyPreviewToken, type PreviewTokenPayload } from './token';
import type { Tenant } from '@/lib/tenant';

export const PREVIEW_COOKIE = 'sajian_preview_token';
export const PREVIEW_COOKIE_TTL_SECONDS = 15 * 60;

export interface PreviewMode {
  draftId: string;
  ownerUserId: string;
  tenantSlug: string;
  payload: PreviewTokenPayload;
}

export async function getPreviewMode(
  tenant: Pick<Tenant, 'slug'> | null,
): Promise<PreviewMode | null> {
  const jar = await cookies();
  const cookieToken = jar.get(PREVIEW_COOKIE)?.value ?? null;
  if (!cookieToken) return null;
  const payload = verifyPreviewToken(cookieToken);
  if (!payload) return null;
  if (tenant && payload.tenant_slug !== tenant.slug) return null;
  return {
    draftId: payload.draft_id,
    ownerUserId: payload.owner_user_id,
    tenantSlug: payload.tenant_slug,
    payload,
  };
}

// Reads a preview token off a Next.js page's searchParams snapshot.
// Used by the storefront home page's first-load handler to promote a
// query-param token into a cookie so subsequent in-iframe navigation
// stays in preview mode.
export function readPreviewTokenFromSearchParams(
  search: Record<string, string | string[] | undefined> | null | undefined,
  tenantSlug: string | null,
): { token: string; payload: PreviewTokenPayload } | null {
  if (!search) return null;
  const raw = search['preview_token'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return null;
  const payload = verifyPreviewToken(token);
  if (!payload) return null;
  if (tenantSlug && payload.tenant_slug !== tenantSlug) return null;
  return { token, payload };
}
