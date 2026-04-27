// Unit coverage for the order-display helpers. The bug they prevent
// (stale "Burger Lakeside" branch name printing on a Sandwicherie
// Lakeside receipt — see migration 021) was a class of bug, not a
// one-off; a future regression here would silently re-introduce the
// same wrong-tenant-on-receipt symptom.

import { describe, it, expect } from 'vitest';
import { formatOrderLocationLabel, formatOrderBranchSuffix } from './display';

describe('formatOrderLocationLabel', () => {
  it('returns the branch name when set', () => {
    expect(
      formatOrderLocationLabel({
        branchName: 'Citra 8',
        tenantName: 'Sandwicherie Lakeside',
      }),
    ).toBe('Citra 8');
  });

  it('falls back to tenant name when branch is null (default branch case)', () => {
    expect(
      formatOrderLocationLabel({
        branchName: null,
        tenantName: 'Sandwicherie Lakeside',
      }),
    ).toBe('Sandwicherie Lakeside');
  });

  it('falls back to tenant name when branch is undefined', () => {
    expect(
      formatOrderLocationLabel({
        branchName: undefined,
        tenantName: 'Sandwicherie Lakeside',
      }),
    ).toBe('Sandwicherie Lakeside');
  });

  it('falls back to tenant name when branch is whitespace-only', () => {
    expect(
      formatOrderLocationLabel({ branchName: '   ', tenantName: 'Mindiology' }),
    ).toBe('Mindiology');
  });

  it('trims surrounding whitespace from a real branch name', () => {
    expect(
      formatOrderLocationLabel({ branchName: '  Sudirman  ', tenantName: 'X' }),
    ).toBe('Sudirman');
  });
});

describe('formatOrderBranchSuffix', () => {
  it('returns the branch name when set', () => {
    expect(formatOrderBranchSuffix('Citra 8')).toBe('Citra 8');
  });

  it('returns null on null branch (default branch — caller drops the suffix)', () => {
    expect(formatOrderBranchSuffix(null)).toBeNull();
  });

  it('returns null on undefined branch', () => {
    expect(formatOrderBranchSuffix(undefined)).toBeNull();
  });

  it('returns null on whitespace-only branch', () => {
    expect(formatOrderBranchSuffix('   ')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(formatOrderBranchSuffix('  Sudirman  ')).toBe('Sudirman');
  });
});
