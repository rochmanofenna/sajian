// Whitelist-based CSS style sanitizer. The only path from untrusted
// section props to React's `style` attribute. Every property name must be
// on the allow-list; every value is re-validated against a per-property
// predicate that prevents `expression()`, `javascript:`, `url()` to
// arbitrary hosts, and the classic list of IE/Moz behavior injection
// vectors.
//
// Design notes:
// - We use kebab-case keys on the input side because that's what a
//   codegen prompt will produce and what CSS authors think in. The
//   output is camelCased React CSSProperties.
// - Values are either numbers (passed through, with unit appended where
//   React would add `px`) or strings. Strings are token-scanned: spaces
//   split tokens, each token is checked against the property's allowed
//   token patterns.
// - `transform` accepts only translate/rotate/scale/translateX/Y,
//   rotateX/Y/Z, scaleX/Y. No `matrix()`, no `calc()` (for now), no
//   JavaScript-y function calls.
// - `background-image` accepts `url(...)` only when the URL's host is
//   in the allow-list. We reuse the host list from canvas-schema so
//   there's one trust boundary for inline images.

const SAFE_STYLE_KEYS = [
  // Layout
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'column-gap',
  'row-gap',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-content',
  'align-self',
  'justify-content',
  'justify-items',
  'justify-self',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'grid-auto-flow',

  // Visual
  'color',
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'opacity',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'box-shadow',

  // Typography
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  'white-space',

  // Effects
  'transform',
  'transform-origin',
  'filter',
  'transition',
  'animation',
  'will-change',

  // Misc used by layouts
  'overflow',
  'overflow-x',
  'overflow-y',
  'z-index',
  'cursor',
  'pointer-events',
  'aspect-ratio',
  'object-fit',
  'object-position',
] as const;

export type SafeStyleKey = (typeof SAFE_STYLE_KEYS)[number];
export type SafeStyleValue = string | number;
export type SafeStyle = Partial<Record<SafeStyleKey, SafeStyleValue>>;

const KEY_SET = new Set<string>(SAFE_STYLE_KEYS);

// Hosts we accept for background-image URLs. Extend explicitly — no
// wildcards, no data:, no blob:. Keep in sync with canvas-schema.
const IMAGE_HOST_ALLOWLIST = [
  /^([a-z0-9-]+\.)*supabase\.co$/,
  /^([a-z0-9-]+\.)*googleusercontent\.com$/,
  /^oaidalleapiprodscus\.blob\.core\.windows\.net$/,
  /^([a-z0-9-]+\.)*sajian\.app$/,
];

const SAFE_BOX_SHADOWS = new Set([
  'none',
  '0 1px 2px rgba(0,0,0,0.06)',
  '0 2px 6px rgba(0,0,0,0.08)',
  '0 4px 12px rgba(0,0,0,0.1)',
  '0 8px 24px rgba(0,0,0,0.12)',
  '0 12px 32px rgba(0,0,0,0.15)',
  '0 24px 60px rgba(0,0,0,0.2)',
  'inset 0 0 0 1px rgba(0,0,0,0.05)',
]);

const SAFE_TRANSITION_PRESETS = new Set([
  'none',
  'all 0.15s ease',
  'all 0.2s ease',
  'all 0.3s ease',
  'all 0.5s ease',
  'opacity 0.3s ease',
  'transform 0.3s ease',
  'background-color 0.3s ease',
  'color 0.3s ease',
]);

const TRANSFORM_FN = /^(translate|translateX|translateY|translateZ|rotate|rotateX|rotateY|rotateZ|scale|scaleX|scaleY|skew|skewX|skewY)\(([\s\S]+?)\)$/;
const FILTER_FN = /^(blur|brightness|contrast|grayscale|saturate|sepia|drop-shadow)\(([\s\S]+?)\)$/;

// ─── Token validators ─────────────────────────────────────────────────

function isNumericToken(v: string): boolean {
  return /^-?\d*\.?\d+(px|%|em|rem|vh|vw|svh|svw|fr)?$/.test(v);
}

function isColorToken(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (t === 'transparent' || t === 'currentcolor' || t === 'inherit') return true;
  if (/^#[0-9a-f]{3,8}$/.test(t)) return true;
  if (/^rgba?\(\s*-?\d+(\s*,\s*-?\d+){2,3}(\s*,\s*-?\d*\.?\d+)?\s*\)$/.test(t)) return true;
  if (/^hsla?\(\s*-?\d+(\.\d+)?(deg)?(\s*,\s*-?\d+(\.\d+)?%){2}(\s*,\s*-?\d*\.?\d+)?\s*\)$/.test(t)) return true;
  return false;
}

function isSafeUrl(raw: string): boolean {
  // Accepts url("...") / url('...') / url(...); rejects javascript:, data:, etc.
  const m = raw.match(/^url\(\s*(['"])?([^'"]+)\1?\s*\)$/i);
  if (!m) return false;
  const inner = m[2].trim();
  try {
    const u = new URL(inner);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return IMAGE_HOST_ALLOWLIST.some((rx) => rx.test(u.hostname));
  } catch {
    return false;
  }
}

function isLinearGradient(raw: string): boolean {
  const t = raw.trim();
  if (!/^(linear|radial)-gradient\(/i.test(t)) return false;
  // Reject anything smelling like injection: quotes, semicolons, braces, url().
  return !/[";{}]|url\s*\(/i.test(t);
}

// Validators per key. Receiving a STRING — numbers get normalized to
// strings first. Returns the final cleaned string (or null to drop).
type Validator = (raw: string) => string | null;

const INT_RANGE = (min: number, max: number): Validator => (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return String(Math.round(n));
};

const NUMERIC: Validator = (raw) => (isNumericToken(raw) ? raw : null);

const COLOR: Validator = (raw) => (isColorToken(raw) ? raw : null);

const BACKGROUND: Validator = (raw) => {
  const t = raw.trim();
  if (isColorToken(t)) return t;
  if (isSafeUrl(t)) return t;
  if (isLinearGradient(t)) return t;
  return null;
};

const ENUM = (...allowed: string[]): Validator => {
  const set = new Set(allowed);
  return (raw) => (set.has(raw.trim().toLowerCase()) ? raw.trim().toLowerCase() : null);
};

const BOX_SHADOW: Validator = (raw) => (SAFE_BOX_SHADOWS.has(raw) ? raw : null);
const TRANSITION: Validator = (raw) => (SAFE_TRANSITION_PRESETS.has(raw) ? raw : null);

const TRANSFORM: Validator = (raw) => {
  const parts = raw
    .split(/\)\s+/)
    .map((p) => (p.endsWith(')') ? p : `${p})`))
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const m = part.match(TRANSFORM_FN);
    if (!m) return null;
    const args = m[2].split(',').map((a) => a.trim());
    for (const arg of args) {
      if (!/^-?\d*\.?\d+(px|%|deg|rad|turn)?$/.test(arg)) return null;
    }
  }
  return raw;
};

const FILTER: Validator = (raw) => {
  const parts = raw
    .split(/\)\s+/)
    .map((p) => (p.endsWith(')') ? p : `${p})`))
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const m = part.match(FILTER_FN);
    if (!m) return null;
    const arg = m[2].trim();
    if (!/^-?\d*\.?\d+(px|%|deg)?$/.test(arg) && !isNumericToken(arg)) return null;
  }
  return raw;
};

const BORDER: Validator = (raw) => {
  // Matches `1px solid #fff`, `2px dashed rgba(...)`, etc.
  // Parsed conservatively: split on spaces, expect width / style / color.
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length > 3) return null;
  for (const p of parts) {
    if (
      isNumericToken(p) ||
      isColorToken(p) ||
      ['solid', 'dashed', 'dotted', 'double', 'none'].includes(p.toLowerCase())
    ) continue;
    return null;
  }
  return raw;
};

const ASPECT_RATIO: Validator = (raw) => {
  if (/^\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?$/.test(raw.trim())) return raw.trim();
  return null;
};

const VALIDATORS: Record<SafeStyleKey, Validator> = {
  display: ENUM('block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none'),
  position: ENUM('static', 'relative', 'absolute', 'fixed', 'sticky'),
  top: NUMERIC,
  right: NUMERIC,
  bottom: NUMERIC,
  left: NUMERIC,
  width: NUMERIC,
  height: NUMERIC,
  'min-width': NUMERIC,
  'min-height': NUMERIC,
  'max-width': NUMERIC,
  'max-height': NUMERIC,
  padding: NUMERIC,
  'padding-top': NUMERIC,
  'padding-right': NUMERIC,
  'padding-bottom': NUMERIC,
  'padding-left': NUMERIC,
  margin: NUMERIC,
  'margin-top': NUMERIC,
  'margin-right': NUMERIC,
  'margin-bottom': NUMERIC,
  'margin-left': NUMERIC,
  gap: NUMERIC,
  'column-gap': NUMERIC,
  'row-gap': NUMERIC,
  flex: (raw) => (/^\d+(\s+\d+(\s+\S+)?)?$|^(auto|none|initial)$/.test(raw) ? raw : null),
  'flex-direction': ENUM('row', 'row-reverse', 'column', 'column-reverse'),
  'flex-wrap': ENUM('nowrap', 'wrap', 'wrap-reverse'),
  'flex-grow': (raw) => (/^\d+(\.\d+)?$/.test(raw) ? raw : null),
  'flex-shrink': (raw) => (/^\d+(\.\d+)?$/.test(raw) ? raw : null),
  'flex-basis': NUMERIC,
  'align-items': ENUM('flex-start', 'flex-end', 'center', 'baseline', 'stretch', 'start', 'end'),
  'align-content': ENUM('flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around'),
  'align-self': ENUM('auto', 'flex-start', 'flex-end', 'center', 'baseline', 'stretch'),
  'justify-content': ENUM('flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end'),
  'justify-items': ENUM('start', 'end', 'center', 'stretch'),
  'justify-self': ENUM('auto', 'start', 'end', 'center', 'stretch'),
  'grid-template-columns': (raw) => (/^[\d\s%frpx\-a-z()_]+$/i.test(raw) ? raw : null),
  'grid-template-rows': (raw) => (/^[\d\s%frpx\-a-z()_]+$/i.test(raw) ? raw : null),
  'grid-column': (raw) => (/^[\d\s/\-]+$/.test(raw) ? raw : null),
  'grid-row': (raw) => (/^[\d\s/\-]+$/.test(raw) ? raw : null),
  'grid-auto-flow': ENUM('row', 'column', 'row dense', 'column dense'),

  color: COLOR,
  background: BACKGROUND,
  'background-color': COLOR,
  'background-image': (raw) => (isSafeUrl(raw) || isLinearGradient(raw) ? raw : null),
  'background-size': ENUM('auto', 'cover', 'contain'),
  'background-position': ENUM('top', 'bottom', 'left', 'right', 'center', 'top left', 'top right', 'bottom left', 'bottom right'),
  'background-repeat': ENUM('no-repeat', 'repeat', 'repeat-x', 'repeat-y'),
  opacity: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? String(n) : null;
  },
  border: BORDER,
  'border-top': BORDER,
  'border-right': BORDER,
  'border-bottom': BORDER,
  'border-left': BORDER,
  'border-color': COLOR,
  'border-width': NUMERIC,
  'border-style': ENUM('solid', 'dashed', 'dotted', 'double', 'none'),
  'border-radius': NUMERIC,
  'box-shadow': BOX_SHADOW,

  'font-size': NUMERIC,
  'font-weight': INT_RANGE(100, 900),
  'font-style': ENUM('normal', 'italic', 'oblique'),
  'font-family': (raw) => (/^[\w\s,'"\-]+$/.test(raw) ? raw : null),
  'line-height': (raw) => (isNumericToken(raw) || /^\d*\.?\d+$/.test(raw) ? raw : null),
  'letter-spacing': NUMERIC,
  'text-align': ENUM('left', 'right', 'center', 'justify', 'start', 'end'),
  'text-transform': ENUM('none', 'uppercase', 'lowercase', 'capitalize'),
  'text-decoration': ENUM('none', 'underline', 'line-through', 'overline'),
  'white-space': ENUM('normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line'),

  transform: TRANSFORM,
  'transform-origin': (raw) => (/^[\w\s%\.\-]+$/.test(raw) ? raw : null),
  filter: FILTER,
  transition: TRANSITION,
  animation: (raw) =>
    /^sj-[a-z0-9-]+ \d+(\.\d+)?m?s [a-z-]+( (both|forwards|backwards))?$/.test(raw) ? raw : null,
  'will-change': ENUM('auto', 'transform', 'opacity'),

  overflow: ENUM('visible', 'hidden', 'scroll', 'auto', 'clip'),
  'overflow-x': ENUM('visible', 'hidden', 'scroll', 'auto', 'clip'),
  'overflow-y': ENUM('visible', 'hidden', 'scroll', 'auto', 'clip'),
  'z-index': INT_RANGE(-50, 50),
  cursor: ENUM('auto', 'default', 'pointer', 'text', 'move', 'not-allowed', 'grab', 'grabbing'),
  'pointer-events': ENUM('auto', 'none'),
  'aspect-ratio': ASPECT_RATIO,
  'object-fit': ENUM('contain', 'cover', 'fill', 'none', 'scale-down'),
  'object-position': (raw) => (/^[\w\s%\-\.]+$/.test(raw) ? raw : null),
};

// kebab → camel for React style keys.
function camelize(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalize(value: SafeStyleValue, key: SafeStyleKey): string {
  if (typeof value === 'number') {
    // Properties that accept unitless numbers (font-weight, opacity,
    // line-height, z-index, flex-grow/shrink) shouldn't have px appended.
    const unitlessKeys: SafeStyleKey[] = [
      'font-weight',
      'opacity',
      'line-height',
      'z-index',
      'flex-grow',
      'flex-shrink',
    ];
    if (unitlessKeys.includes(key)) return String(value);
    return `${value}px`;
  }
  return value;
}

export class SafeStyleError extends Error {
  constructor(public readonly key: string, public readonly value: unknown, message: string) {
    super(message);
    this.name = 'SafeStyleError';
  }
}

// Returns the sanitized React style object. Drops any unknown keys and
// any values that fail their validator. Never throws — we log and
// continue so a bad prop can't take down the page. Callers that need
// strictness (the sanitizer at write time) should use `validateStyle`.
export function sanitizeStyle(raw: unknown): React.CSSProperties {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase();
    if (!KEY_SET.has(key)) continue;
    if (rawValue === null || rawValue === undefined) continue;
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') continue;
    const asString = normalize(rawValue as SafeStyleValue, key as SafeStyleKey);
    const valid = VALIDATORS[key as SafeStyleKey](asString);
    if (valid === null) continue;
    out[camelize(key)] = valid;
  }
  return out as React.CSSProperties;
}

// Strict variant used by the sanitizer at codegen write time. Throws on
// any violation so bad input is rejected before it lands in the DB.
export function validateStyle(raw: unknown, path = 'style'): SafeStyle {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object') {
    throw new SafeStyleError(path, raw, `${path} must be an object`);
  }
  const out: Partial<Record<SafeStyleKey, SafeStyleValue>> = {};
  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase();
    if (!KEY_SET.has(key)) {
      throw new SafeStyleError(`${path}.${rawKey}`, rawValue, `property '${rawKey}' is not allowed`);
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      throw new SafeStyleError(`${path}.${rawKey}`, rawValue, `property '${rawKey}' must be string or number`);
    }
    const asString = normalize(rawValue as SafeStyleValue, key as SafeStyleKey);
    const valid = VALIDATORS[key as SafeStyleKey](asString);
    if (valid === null) {
      throw new SafeStyleError(`${path}.${rawKey}`, rawValue, `value '${String(rawValue)}' is not a valid ${key}`);
    }
    out[key as SafeStyleKey] = valid;
  }
  return out;
}

export function isSafeStyleKey(k: string): k is SafeStyleKey {
  return KEY_SET.has(k);
}

export const SAFE_STYLE_KEYS_LIST = SAFE_STYLE_KEYS;
