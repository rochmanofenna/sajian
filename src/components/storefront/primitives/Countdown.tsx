'use client';

// Countdown primitive — ticks every second until `target_iso`, renders
// the remaining time in one of four formats. Handles the expired case
// via `on_expire`: 'hide' removes the component, 'show-expired-text'
// swaps in `expired_text`, 'keep' leaves the 00:00:00 in place.

import { useEffect, useState, type CSSProperties } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export type CountdownFormat = 'dhms' | 'hms' | 'ms' | 'days-only';
export type ExpireBehavior = 'hide' | 'show-expired-text' | 'keep';

export interface CountdownProps {
  target_iso: string;
  format?: CountdownFormat;
  expired_text?: string;
  on_expire?: ExpireBehavior;
  className?: string;
  style?: Record<string, unknown>;
}

function part(ms: number, div: number, mod: number): string {
  return Math.max(0, Math.floor((ms / div) % mod))
    .toString()
    .padStart(2, '0');
}

function render(ms: number, format: CountdownFormat): string {
  if (ms <= 0) {
    if (format === 'days-only') return '0d';
    if (format === 'ms') return '00:00';
    if (format === 'hms') return '00:00:00';
    return '0d 00:00:00';
  }
  const days = Math.floor(ms / 86_400_000);
  const hh = part(ms, 3_600_000, 24);
  const mm = part(ms, 60_000, 60);
  const ss = part(ms, 1_000, 60);
  switch (format) {
    case 'days-only':
      return `${days}d`;
    case 'ms':
      return `${mm}:${ss}`;
    case 'hms':
      return `${hh}:${mm}:${ss}`;
    case 'dhms':
    default:
      return `${days}d ${hh}:${mm}:${ss}`;
  }
}

export function Countdown({
  target_iso,
  format = 'dhms',
  expired_text = 'Sudah selesai',
  on_expire = 'show-expired-text',
  className,
  style,
}: CountdownProps) {
  const target = (() => {
    const t = Date.parse(target_iso);
    return Number.isFinite(t) ? t : null;
  })();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (target === null) return null;
  const remaining = target - now;
  const expired = remaining <= 0;

  if (expired && on_expire === 'hide') return null;

  const css: CSSProperties = style ? sanitizeStyle(style) : {};
  const text = expired && on_expire === 'show-expired-text' ? expired_text : render(remaining, format);

  return (
    <span className={className} style={css} aria-live="polite">
      {text}
    </span>
  );
}
