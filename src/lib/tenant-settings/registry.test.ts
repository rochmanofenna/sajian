// Settings-registry coverage. Adding a setting in registry.ts
// auto-extends three downstream surfaces (PATCH route, ChatPanel
// whitelist, AI prompt examples). These tests pin the contract:
// every transform runs on apply, every schema rejection turns into
// a SettingValidationError with `invalid_value`, key→column maps
// stay correct, and the prompt-block has one line per registered
// setting.

import { describe, it, expect } from 'vitest';
import {
  TENANT_SETTINGS,
  applySettingValue,
  SettingValidationError,
  getSettingDef,
  settingKeys,
  settingsExamplesPromptBlock,
} from './registry';

describe('TENANT_SETTINGS registry', () => {
  it('every entry has key, column, schema, label, example', () => {
    for (const def of TENANT_SETTINGS) {
      expect(def.key.length).toBeGreaterThan(0);
      expect(def.column.length).toBeGreaterThan(0);
      expect(def.schema).toBeDefined();
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.example.length).toBeGreaterThan(0);
    }
  });

  it('keys are unique', () => {
    const set = new Set(TENANT_SETTINGS.map((d) => d.key));
    expect(set.size).toBe(TENANT_SETTINGS.length);
  });

  it('settingKeys() returns every registered key', () => {
    expect(settingKeys().sort()).toEqual(TENANT_SETTINGS.map((d) => d.key).sort());
  });

  it('getSettingDef returns null for unknown key', () => {
    expect(getSettingDef('not_a_real_key')).toBeNull();
    expect(getSettingDef('multi_branch_mode')?.column).toBe('multi_branch_mode');
  });
});

describe('applySettingValue — happy paths', () => {
  it('passes booleans through unchanged', () => {
    const r = applySettingValue('multi_branch_mode', false);
    expect(r).toEqual({ column: 'multi_branch_mode', value: false });
  });

  it('passes valid strings through unchanged', () => {
    const r = applySettingValue('currency_symbol', '$');
    expect(r).toEqual({ column: 'currency_symbol', value: '$' });
  });

  it('passes valid emails through unchanged', () => {
    const r = applySettingValue('contact_email', 'halo@toko.id');
    expect(r).toEqual({ column: 'contact_email', value: 'halo@toko.id' });
  });

  it('accepts null for nullable columns', () => {
    expect(applySettingValue('contact_email', null)).toEqual({
      column: 'contact_email',
      value: null,
    });
    expect(applySettingValue('heading_font_family', null)).toEqual({
      column: 'heading_font_family',
      value: null,
    });
  });
});

describe('applySettingValue — transforms', () => {
  it('tax_rate_percent (UI) → tax_rate_bps (storage), times 100', () => {
    expect(applySettingValue('tax_rate_percent', 11)).toEqual({
      column: 'tax_rate_bps',
      value: 1100,
    });
    expect(applySettingValue('tax_rate_percent', 11.5)).toEqual({
      column: 'tax_rate_bps',
      value: 1150,
    });
  });

  it('service_charge_percent → service_charge_bps', () => {
    expect(applySettingValue('service_charge_percent', 5)).toEqual({
      column: 'service_charge_bps',
      value: 500,
    });
  });

  it('tax_rate_percent rounds rather than truncates', () => {
    expect(applySettingValue('tax_rate_percent', 11.005)).toEqual({
      column: 'tax_rate_bps',
      value: 1101,
    });
  });

  it('instagram_handle strips leading @', () => {
    expect(applySettingValue('instagram_handle', '@satetaichanuda')).toEqual({
      column: 'instagram_handle',
      value: 'satetaichanuda',
    });
  });

  it('instagram_handle without @ stays unchanged', () => {
    expect(applySettingValue('instagram_handle', 'satetaichanuda')).toEqual({
      column: 'instagram_handle',
      value: 'satetaichanuda',
    });
  });

  it('tiktok_handle strips leading @', () => {
    expect(applySettingValue('tiktok_handle', '@taichanjuara')).toEqual({
      column: 'tiktok_handle',
      value: 'taichanjuara',
    });
  });
});

describe('applySettingValue — validation failures', () => {
  it('throws SettingValidationError for unknown key', () => {
    expect(() => applySettingValue('not_a_setting', 'x')).toThrow(SettingValidationError);
    try {
      applySettingValue('not_a_setting', 'x');
    } catch (err) {
      expect((err as SettingValidationError).reason).toBe('unknown_key');
      expect((err as SettingValidationError).detail).toBe('not_a_setting');
    }
  });

  it('throws SettingValidationError for invalid email', () => {
    expect(() => applySettingValue('contact_email', 'not-an-email')).toThrow(SettingValidationError);
  });

  it('throws SettingValidationError for tax outside 0-50%', () => {
    expect(() => applySettingValue('tax_rate_percent', -1)).toThrow(SettingValidationError);
    expect(() => applySettingValue('tax_rate_percent', 51)).toThrow(SettingValidationError);
  });

  it('throws SettingValidationError for invalid currency_symbol', () => {
    expect(() => applySettingValue('currency_symbol', '')).toThrow(SettingValidationError);
    expect(() =>
      applySettingValue('currency_symbol', 'this-is-way-too-long'),
    ).toThrow(SettingValidationError);
  });

  it('throws SettingValidationError for invalid instagram pattern', () => {
    expect(() =>
      applySettingValue('instagram_handle', 'has spaces invalid'),
    ).toThrow(SettingValidationError);
    expect(() => applySettingValue('instagram_handle', '!!@@##')).toThrow(SettingValidationError);
  });
});

describe('settingsExamplesPromptBlock', () => {
  it('produces one line per registered setting', () => {
    const lines = settingsExamplesPromptBlock().split('\n');
    expect(lines.length).toBe(TENANT_SETTINGS.length);
  });

  it('every line begins with whitespace + User: …', () => {
    for (const line of settingsExamplesPromptBlock().split('\n')) {
      expect(line).toMatch(/^\s+User:/);
    }
  });
});
