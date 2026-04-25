// Preview-token JWT helpers. Owner /setup obtains a short-lived
// signed token bound to (draft_id, owner_user_id). The token rides
// the iframe URL as ?preview_token=...; the storefront verifies it on
// every server render before swapping the data source from the
// published storefront_sections to the live draft.
//
// Stateless: payload is signed with HS256 against PREVIEW_TOKEN_SECRET
// (falls back to SUPABASE_SERVICE_ROLE_KEY in dev so localhost setup
// works without an extra env). 15-minute TTL — owner is on /setup
// editing actively, so a refresh every 14 minutes from the parent is
// trivial. No revocation list; rotating the secret invalidates every
// outstanding token in one move.

import { createHmac } from 'crypto';

export interface PreviewTokenPayload {
  // Draft row this token refers to. Storefront server reads
  // onboarding_drafts.draft for this user and renders that instead
  // of the published storefront_sections.
  draft_id: string;
  // Authed owner who minted the token. Storefront verifies the same
  // owner still owns the tenant being previewed; mismatch → reject.
  owner_user_id: string;
  // Tenant slug the owner is allowed to preview as. The iframe URL
  // would normally make this redundant, but pinning it inside the
  // payload prevents a malicious owner from minting a token for
  // their tenant and playing it against another tenant's subdomain.
  tenant_slug: string;
  // Standard iat / exp seconds-since-epoch.
  iat: number;
  exp: number;
}

const TTL_SECONDS = 15 * 60;

function getSecret(): string {
  return (
    process.env.PREVIEW_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'dev-only-do-not-use-in-prod'
  );
}

function b64urlEncode(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecodeToString(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function sign(message: string): string {
  return b64urlEncode(createHmac('sha256', getSecret()).update(message).digest());
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function signPreviewToken(opts: {
  draftId: string;
  ownerUserId: string;
  tenantSlug: string;
}): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const payload: PreviewTokenPayload = {
    draft_id: opts.draftId,
    owner_user_id: opts.ownerUserId,
    tenant_slug: opts.tenantSlug,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = sign(`${header}.${body}`);
  return { token: `${header}.${body}.${sig}`, expiresAt: payload.exp };
}

export function verifyPreviewToken(token: string | null | undefined): PreviewTokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;
  const expected = sign(`${header}.${body}`);
  if (!timingSafeEqualStr(expected, sig)) return null;
  try {
    const headerJson = JSON.parse(b64urlDecodeToString(header)) as { alg?: string; typ?: string };
    if (headerJson.alg !== 'HS256') return null;
    const payload = JSON.parse(b64urlDecodeToString(body)) as PreviewTokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (typeof payload.draft_id !== 'string' || typeof payload.owner_user_id !== 'string') {
      return null;
    }
    if (typeof payload.tenant_slug !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}
