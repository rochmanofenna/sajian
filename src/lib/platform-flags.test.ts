// platform-flags fail-closed semantics. The Xendit-class bug
// recurs the moment digital_payments_enabled silently returns
// `true` when it should be `false`. These tests pin the contract:
//
//   • value === true → enabled
//   • value === false → disabled
//   • any other shape (string "true", number 1, missing row, DB
//     error, undefined) → DISABLED
//
// We mock the supabase service client so the test doesn't need DB
// access — the goal is to verify the boolean coercion + error
// path behavior, not Supabase wire compatibility.

import { describe, it, expect, beforeEach, vi } from 'vitest';

type FromShape = {
  select: (cols: string) => Promise<{ data: Array<{ key: string; value: unknown }> | null; error: Error | null }>;
};

let fakeRows: Array<{ key: string; value: unknown }> | null = null;
let fakeError: Error | null = null;

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (_t: string): FromShape => ({
      select: () => Promise.resolve({ data: fakeRows, error: fakeError }),
    }),
  }),
}));

import { isDigitalPaymentsEnabled, __invalidatePlatformFlagsCache } from './platform-flags';

describe('isDigitalPaymentsEnabled — fail-closed', () => {
  beforeEach(() => {
    fakeRows = null;
    fakeError = null;
    __invalidatePlatformFlagsCache();
  });

  it('returns true only when value is exactly boolean true', async () => {
    fakeRows = [{ key: 'digital_payments_enabled', value: true }];
    expect(await isDigitalPaymentsEnabled()).toBe(true);
  });

  it('returns false when value is boolean false', async () => {
    fakeRows = [{ key: 'digital_payments_enabled', value: false }];
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });

  it('returns false when value is the string "true" (no coercion)', async () => {
    fakeRows = [{ key: 'digital_payments_enabled', value: 'true' }];
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });

  it('returns false when value is 1 (no coercion)', async () => {
    fakeRows = [{ key: 'digital_payments_enabled', value: 1 }];
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });

  it('returns false when the flag row is missing', async () => {
    fakeRows = [];
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });

  it('returns false when value is null', async () => {
    fakeRows = [{ key: 'digital_payments_enabled', value: null }];
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });

  it('returns false when DB query errors', async () => {
    fakeError = new Error('connection refused');
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });

  it('does not leak unrelated flag values into the answer', async () => {
    // Even with another flag that's truthy, only the specific key
    // matters. Belt-and-suspenders against accidental `Object.values`-
    // style logic regressions in the reader.
    fakeRows = [
      { key: 'codegen_globally_enabled', value: true },
      { key: 'digital_payments_enabled', value: false },
    ];
    expect(await isDigitalPaymentsEnabled()).toBe(false);
  });
});
