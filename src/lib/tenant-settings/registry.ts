// Schema-driven registry of every tenant setting the AI is allowed
// to mutate via update_tenant_setting. ONE entry per setting drives
// three downstream consumers:
//
//   1. /api/admin/tenant PATCH — derives a zod schema for validation
//      + maps the AI-facing key to the storage column.
//   2. ChatPanel.applyTenantSetting — the runtime whitelist check
//      reads keys directly from this map.
//   3. AI prompt — generates the example block for ABSOLUTE RULE 7
//      from the same definitions, so prompt + executor never drift.
//
// Adding setting #N is ~10 lines: add an entry here. The downstream
// consumers pick it up automatically (and the migration is one
// ALTER TABLE … ADD COLUMN line if a column doesn't already exist).
//
// Keys are AI-facing names (what Claude emits in update_tenant_setting
// args). They map to the actual `tenants` column via `column`.

import { z } from 'zod';

export type SettingValue = string | number | boolean | null;

export interface SettingDefinition {
  // AI-facing key. Stable; renaming breaks prompts + saved chats.
  key: string;
  // Actual tenants table column. May differ from key when we want
  // to express percent-style ints to the AI but store basis points
  // in the DB (tax_rate_percent ↔ tax_rate_bps).
  column: string;
  // Zod validator the PATCH route applies to the incoming value.
  schema: z.ZodTypeAny;
  // Optional transform applied before write (UI-side units → storage
  // units, e.g. 11 → 1100 for tax_rate_percent → bps).
  transform?: (value: unknown) => SettingValue;
  // Short human label used in confirmation copy ("mata uang", "pajak", ...).
  label: string;
  // One-line example for the AI prompt — keeps prompt drift in check.
  example: string;
}

// Every setting. Update this to add new ones — the downstream
// consumers fan out automatically.
export const TENANT_SETTINGS: SettingDefinition[] = [
  {
    key: 'multi_branch_mode',
    column: 'multi_branch_mode',
    schema: z.boolean().nullable(),
    label: 'mode multi-cabang',
    example: 'User: "matikan multi branch" → key=multi_branch_mode value=false',
  },
  {
    key: 'currency_symbol',
    column: 'currency_symbol',
    schema: z.string().min(1).max(8),
    label: 'mata uang',
    example: 'User: "ganti currency jadi USD" → key=currency_symbol value="$"',
  },
  {
    key: 'locale',
    column: 'locale',
    schema: z.string().min(2).max(16),
    label: 'locale',
    example: 'User: "set bahasa ke Inggris" → key=locale value="en-US"',
  },
  {
    key: 'support_whatsapp',
    column: 'support_whatsapp',
    schema: z.string().max(32).nullable(),
    label: 'WhatsApp support',
    example: 'User: "wa kita 0812..." → key=support_whatsapp value="+628123456789"',
  },
  {
    key: 'contact_email',
    column: 'contact_email',
    schema: z.string().email().max(240).nullable(),
    label: 'email kontak',
    example: 'User: "email kita halo@toko.id" → key=contact_email value="halo@toko.id"',
  },
  {
    key: 'is_active',
    column: 'is_active',
    schema: z.boolean(),
    label: 'status aktif toko',
    example: 'User: "matikan toko sementara" → key=is_active value=false',
  },
  {
    key: 'heading_font_family',
    column: 'heading_font_family',
    schema: z.string().trim().min(1).max(80).nullable(),
    label: 'font heading',
    example: 'User: "ganti heading ke Futura" → key=heading_font_family value="Futura"',
  },
  {
    key: 'body_font_family',
    column: 'body_font_family',
    schema: z.string().trim().min(1).max(80).nullable(),
    label: 'font body',
    example: 'User: "body ke Inter" → key=body_font_family value="Inter"',
  },
  {
    key: 'favicon_url',
    column: 'favicon_url',
    schema: z.string().url().max(800).nullable(),
    label: 'favicon',
    example:
      'User: "ganti favicon" → key=favicon_url value="<uploaded url>"',
  },
  {
    key: 'tax_rate_percent',
    column: 'tax_rate_bps',
    schema: z.number().min(0).max(50),
    transform: (v) => Math.round(Number(v) * 100),
    label: 'pajak',
    example:
      'User: "set pajak 11%" → key=tax_rate_percent value=11 (UI percent; stored as bps)',
  },
  {
    key: 'service_charge_percent',
    column: 'service_charge_bps',
    schema: z.number().min(0).max(50),
    transform: (v) => Math.round(Number(v) * 100),
    label: 'service charge',
    example: 'User: "service charge 5%" → key=service_charge_percent value=5',
  },
  {
    key: 'instagram_handle',
    column: 'instagram_handle',
    // Strip leading @ on the way in.
    schema: z.string().regex(/^@?[A-Za-z0-9._]{1,30}$/).nullable(),
    transform: (v) => (typeof v === 'string' ? v.replace(/^@/, '') : null),
    label: 'Instagram',
    example:
      'User: "ig kita @satetaichanuda" → key=instagram_handle value="satetaichanuda"',
  },
  {
    key: 'tiktok_handle',
    column: 'tiktok_handle',
    schema: z.string().regex(/^@?[A-Za-z0-9._]{1,30}$/).nullable(),
    transform: (v) => (typeof v === 'string' ? v.replace(/^@/, '') : null),
    label: 'TikTok',
    example: 'User: "tiktok kita @taichanjuara" → key=tiktok_handle value="taichanjuara"',
  },
  {
    key: 'whatsapp_handle',
    column: 'whatsapp_handle',
    schema: z.string().max(64).nullable(),
    label: 'WhatsApp brand',
    example: 'User: "WA brand kita 0812..." → key=whatsapp_handle value="+628123456789"',
  },
];

const KEY_TO_DEF = new Map(TENANT_SETTINGS.map((d) => [d.key, d] as const));

export function getSettingDef(key: string): SettingDefinition | null {
  return KEY_TO_DEF.get(key) ?? null;
}

export function settingKeys(): string[] {
  return TENANT_SETTINGS.map((d) => d.key);
}

// Validate + transform an incoming { key, value } pair. Returns the
// storage-shape `{ column, value }` ready to merge into a tenants
// UPDATE. Throws a typed Error for the PATCH route to translate.
export class SettingValidationError extends Error {
  constructor(public reason: string, public detail?: string) {
    super(`${reason}${detail ? `: ${detail}` : ''}`);
  }
}

export function applySettingValue(
  key: string,
  value: unknown,
): { column: string; value: SettingValue } {
  const def = KEY_TO_DEF.get(key);
  if (!def) throw new SettingValidationError('unknown_key', key);
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) {
    throw new SettingValidationError(
      'invalid_value',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
  }
  const final = def.transform ? def.transform(parsed.data) : (parsed.data as SettingValue);
  return { column: def.column, value: final };
}

// AI-facing prompt block. ABSOLUTE RULE 7 reads from this so adding a
// setting in the registry automatically extends the prompt examples.
export function settingsExamplesPromptBlock(): string {
  return TENANT_SETTINGS.map((d) => `   ${d.example}`).join('\n');
}
