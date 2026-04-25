// Preview-token sign + verify roundtrip + tamper detection.
// The preview iframe's whole security model rides on this verifier:
// a forged token must not pass verifyPreviewToken even if the
// payload looks plausible. These tests pin every failure mode.

import { describe, it, expect, beforeEach } from 'vitest';
import { signPreviewToken, verifyPreviewToken } from './token';

describe('preview-token', () => {
  beforeEach(() => {
    process.env.PREVIEW_TOKEN_SECRET = 'test-secret-please-do-not-commit';
  });

  it('round-trips a valid token', () => {
    const { token } = signPreviewToken({
      draftId: 'user-123',
      ownerUserId: 'auth-456',
      tenantSlug: 'mindiology',
    });
    const payload = verifyPreviewToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.draft_id).toBe('user-123');
    expect(payload?.owner_user_id).toBe('auth-456');
    expect(payload?.tenant_slug).toBe('mindiology');
  });

  it('returns expiresAt 15 minutes in the future', () => {
    const { expiresAt } = signPreviewToken({
      draftId: 'd',
      ownerUserId: 'u',
      tenantSlug: 't',
    });
    const now = Math.floor(Date.now() / 1000);
    expect(expiresAt - now).toBeGreaterThanOrEqual(14 * 60);
    expect(expiresAt - now).toBeLessThanOrEqual(15 * 60 + 5);
  });

  it('rejects null / empty / malformed input', () => {
    expect(verifyPreviewToken(null)).toBeNull();
    expect(verifyPreviewToken(undefined)).toBeNull();
    expect(verifyPreviewToken('')).toBeNull();
    expect(verifyPreviewToken('not.a.token')).toBeNull();
    expect(verifyPreviewToken('only-one-segment')).toBeNull();
    expect(verifyPreviewToken('two.segments')).toBeNull();
    expect(verifyPreviewToken('four.too.many.segments')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    process.env.PREVIEW_TOKEN_SECRET = 'secret-A';
    const { token } = signPreviewToken({
      draftId: 'd',
      ownerUserId: 'u',
      tenantSlug: 't',
    });
    process.env.PREVIEW_TOKEN_SECRET = 'secret-B';
    expect(verifyPreviewToken(token)).toBeNull();
  });

  it('rejects a token whose payload was tampered', () => {
    const { token } = signPreviewToken({
      draftId: 'd',
      ownerUserId: 'u',
      tenantSlug: 'mindiology',
    });
    const [header, , sig] = token.split('.');
    const fakePayload = Buffer.from(
      JSON.stringify({
        draft_id: 'd',
        owner_user_id: 'u',
        tenant_slug: 'attacker-tenant',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    )
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const forged = `${header}.${fakePayload}.${sig}`;
    expect(verifyPreviewToken(forged)).toBeNull();
  });

  it('rejects an expired token', () => {
    // Manually construct a token with exp in the past, signed with
    // the live secret — this isolates the exp check from the
    // signature check.
    const past = Math.floor(Date.now() / 1000) - 60;
    const { token: real } = signPreviewToken({
      draftId: 'd',
      ownerUserId: 'u',
      tenantSlug: 't',
    });
    // Re-encode the body with an expired exp, then re-sign so the
    // signature stays valid for THIS payload — the verifier should
    // still reject because exp is in the past.
    const [header, , sigPart] = real.split('.');
    void sigPart;
    const expiredBody = JSON.stringify({
      draft_id: 'd',
      owner_user_id: 'u',
      tenant_slug: 't',
      iat: past - 60,
      exp: past,
    });
    const b64body = Buffer.from(expiredBody)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const { createHmac } = require('node:crypto');
    const newSig = createHmac('sha256', process.env.PREVIEW_TOKEN_SECRET!)
      .update(`${header}.${b64body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const expired = `${header}.${b64body}.${newSig}`;
    expect(verifyPreviewToken(expired)).toBeNull();
  });

  it('rejects a token whose alg header is not HS256', () => {
    // Construct a token with a "none" alg attempt — old JWT
    // implementations accepted alg:none, so the verifier must
    // explicitly reject it.
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const body = Buffer.from(
      JSON.stringify({
        draft_id: 'd',
        owner_user_id: 'u',
        tenant_slug: 't',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    )
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const { createHmac } = require('node:crypto');
    const sig = createHmac('sha256', process.env.PREVIEW_TOKEN_SECRET!)
      .update(`${noneHeader}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(verifyPreviewToken(`${noneHeader}.${body}.${sig}`)).toBeNull();
  });

  it('rejects payloads missing required fields', () => {
    const { createHmac } = require('node:crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const partial = Buffer.from(
      JSON.stringify({
        draft_id: 'd',
        // missing owner_user_id + tenant_slug
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    )
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const sig = createHmac('sha256', process.env.PREVIEW_TOKEN_SECRET!)
      .update(`${header}.${partial}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(verifyPreviewToken(`${header}.${partial}.${sig}`)).toBeNull();
  });
});
