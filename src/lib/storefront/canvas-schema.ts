// Whitelist-based sanitizer for Canvas section props. Nothing touches the
// DOM without passing through here — every numeric value clamped, every
// string bounded, every URL verified http(s)-only.
//
// The AI emits props via `update_section_props`/`add_section`; Claude is
// trustworthy-ish but not sandboxed, so we treat its output as
// potentially-adversarial and re-check.

import type { SectionContext } from './section-types';

const ANCHORS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'top-center',
  'bottom-center',
  'center-left',
  'center-right',
  'center',
] as const;

export type CanvasAnchor = (typeof ANCHORS)[number];
export type CanvasElementKind = 'text' | 'button' | 'image' | 'shape';
export type CanvasBackgroundKind = 'color' | 'image' | 'gradient';

export interface SanitizedCanvasPosition {
  anchor: CanvasAnchor;
  offset_x: number;
  offset_y: number;
}

export interface SanitizedCanvasSize {
  width: number | 'auto';
  height: number | 'auto';
}

export interface SanitizedCanvasStyle {
  color?: string;
  background?: string;
  font_size?: number;
  font_weight?: 400 | 500 | 600 | 700;
  border_radius?: number;
  padding?: number;
  opacity?: number;
}

export interface SanitizedCanvasElement {
  id: string;
  kind: CanvasElementKind;
  position: SanitizedCanvasPosition;
  size: SanitizedCanvasSize;
  content?: string;
  href?: string;
  src?: string;
  shape?: 'rectangle' | 'circle';
  style: SanitizedCanvasStyle;
}

export interface SanitizedCanvasProps {
  height_vh: number;
  background: { kind: CanvasBackgroundKind; value: string };
  elements: SanitizedCanvasElement[];
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function boundedString(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

// Safe URL: must be http(s) or a root-relative path (/menu, /checkout).
// Rejects javascript:, data:, file:, etc.
function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim().slice(0, 2048);
  if (!trimmed) return undefined;
  if (/^\/[\w\-./?=&%#]*$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

// Whitelist colors: hex (#rgb, #rrggbb, #rrggbbaa), rgb/rgba() with simple
// numeric args, and a short list of named colors we know are safe.
const NAMED_COLORS = new Set([
  'transparent',
  'white',
  'black',
  'currentcolor',
  'inherit',
]);
function safeColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().toLowerCase().slice(0, 64);
  if (!t) return undefined;
  if (NAMED_COLORS.has(t)) return t;
  if (/^#[0-9a-f]{3,8}$/.test(t)) return t;
  if (/^rgba?\(\s*(-?\d+\s*,\s*){2,3}-?\d*\.?\d+\s*\)$/.test(t)) return t;
  return undefined;
}

// Whitelist gradient strings — accept linear-gradient() and
// radial-gradient() with only color+percentage/deg stops.
function safeGradient(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, 512);
  if (!/^(linear|radial)-gradient\(/i.test(t)) return undefined;
  // Reject obvious injection attempts — quotes, semicolons, url(), etc.
  if (/[";{}]|url\s*\(/i.test(t)) return undefined;
  return t;
}

// Value for an element background — accepts color, gradient, or url(...)
// composed from a safe URL.
function safeElementBackground(v: unknown): string | undefined {
  const color = safeColor(v);
  if (color) return color;
  const grad = safeGradient(v);
  if (grad) return grad;
  return undefined;
}

function sanitizeAnchor(v: unknown): CanvasAnchor {
  return (ANCHORS as readonly string[]).includes(v as string)
    ? (v as CanvasAnchor)
    : 'center';
}

function sanitizeElementKind(v: unknown): CanvasElementKind {
  return v === 'text' || v === 'button' || v === 'image' || v === 'shape' ? v : 'text';
}

function sanitizePosition(v: unknown): SanitizedCanvasPosition {
  const p = (v ?? {}) as Record<string, unknown>;
  return {
    anchor: sanitizeAnchor(p.anchor),
    offset_x: clamp(p.offset_x, -4000, 4000, 0),
    offset_y: clamp(p.offset_y, -4000, 4000, 0),
  };
}

function sanitizeSize(v: unknown): SanitizedCanvasSize {
  const s = (v ?? {}) as Record<string, unknown>;
  const width = s.width === 'auto' ? 'auto' : clamp(s.width, 8, 4000, 0);
  const height = s.height === 'auto' ? 'auto' : clamp(s.height, 8, 4000, 0);
  return {
    width: width === 0 ? 'auto' : width,
    height: height === 0 ? 'auto' : height,
  };
}

const FONT_WEIGHTS = new Set([400, 500, 600, 700]);
function sanitizeFontWeight(v: unknown): 400 | 500 | 600 | 700 | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (FONT_WEIGHTS.has(n as 400 | 500 | 600 | 700)) return n as 400 | 500 | 600 | 700;
  return undefined;
}

function sanitizeStyle(v: unknown): SanitizedCanvasStyle {
  const s = (v ?? {}) as Record<string, unknown>;
  const style: SanitizedCanvasStyle = {};
  const color = safeColor(s.color);
  if (color) style.color = color;
  const bg = safeElementBackground(s.background);
  if (bg) style.background = bg;
  if (s.font_size !== undefined) {
    style.font_size = clamp(s.font_size, 8, 160, 14);
  }
  const fw = sanitizeFontWeight(s.font_weight);
  if (fw) style.font_weight = fw;
  if (s.border_radius !== undefined) {
    style.border_radius = clamp(s.border_radius, 0, 9999, 0);
  }
  if (s.padding !== undefined) {
    style.padding = clamp(s.padding, 0, 96, 0);
  }
  if (s.opacity !== undefined) {
    style.opacity = clamp(s.opacity, 0, 1, 1);
  }
  return style;
}

function sanitizeShape(v: unknown): 'rectangle' | 'circle' {
  return v === 'circle' ? 'circle' : 'rectangle';
}

function sanitizeElement(v: unknown, fallbackCtx: SectionContext): SanitizedCanvasElement | null {
  const raw = (v ?? {}) as Record<string, unknown>;
  const id = boundedString(raw.id, 48);
  if (!id) return null;
  const kind = sanitizeElementKind(raw.kind);
  const base: SanitizedCanvasElement = {
    id,
    kind,
    position: sanitizePosition(raw.position),
    size: sanitizeSize(raw.size),
    style: sanitizeStyle(raw.style),
  };

  if (kind === 'text') {
    const content = boundedString(raw.content, 300);
    if (!content) return null;
    base.content = content;
    if (base.style.color === undefined) base.style.color = fallbackCtx.colors.dark;
    return base;
  }
  if (kind === 'button') {
    const content = boundedString(raw.content, 80) ?? 'Aksi';
    const href = safeUrl(raw.href) ?? '/menu';
    base.content = content;
    base.href = href;
    if (base.style.background === undefined) base.style.background = fallbackCtx.colors.primary;
    if (base.style.color === undefined) base.style.color = fallbackCtx.colors.background;
    if (base.style.border_radius === undefined) base.style.border_radius = 999;
    if (base.style.padding === undefined) base.style.padding = 12;
    return base;
  }
  if (kind === 'image') {
    const src = safeUrl(raw.src);
    if (!src) return null;
    base.src = src;
    return base;
  }
  // shape
  base.shape = sanitizeShape(raw.shape);
  if (base.style.background === undefined) base.style.background = fallbackCtx.colors.primary;
  return base;
}

function sanitizeBackground(v: unknown, ctx: SectionContext): SanitizedCanvasProps['background'] {
  const raw = (v ?? {}) as Record<string, unknown>;
  if (raw.kind === 'image') {
    const url = safeUrl(raw.value);
    if (url) return { kind: 'image', value: url };
  }
  if (raw.kind === 'gradient') {
    const grad = safeGradient(raw.value);
    if (grad) return { kind: 'gradient', value: grad };
  }
  if (raw.kind === 'color') {
    const color = safeColor(raw.value);
    if (color) return { kind: 'color', value: color };
  }
  return { kind: 'color', value: ctx.colors.background };
}

export function sanitizeCanvas(
  props: Record<string, unknown>,
  ctx: SectionContext,
): SanitizedCanvasProps {
  const rawElements = Array.isArray(props.elements) ? props.elements : [];
  const elements: SanitizedCanvasElement[] = [];
  for (const raw of rawElements) {
    const safe = sanitizeElement(raw, ctx);
    if (safe) elements.push(safe);
    if (elements.length >= 24) break; // hard cap — no runaway payloads
  }

  return {
    height_vh: clamp(props.height_vh, 10, 100, 60),
    background: sanitizeBackground(props.background, ctx),
    elements,
  };
}
