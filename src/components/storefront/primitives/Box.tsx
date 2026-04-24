// Box — generic styled container. The fallback primitive when nothing
// more specific fits. Every style prop routes through sanitizeStyle so
// the AI can hand us a broad bag of CSS and we filter it to the safe
// subset.

import { type CSSProperties, type ReactNode } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export interface BoxProps {
  padding?: number | string;
  margin?: number | string;
  width?: number | string;
  height?: number | string;
  background?: string;
  border_radius?: number | string;
  className?: string;
  style?: Record<string, unknown>;
  children?: ReactNode;
}

function toCssValue(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return `${v}px`;
  return v;
}

export function Box({
  padding,
  margin,
  width,
  height,
  background,
  border_radius,
  className,
  style,
  children,
}: BoxProps) {
  // Start from the explicit convenience props, then let `style` override
  // so the sanitizer has the final say on conflicting declarations.
  const base: CSSProperties = {
    padding: toCssValue(padding),
    margin: toCssValue(margin),
    width: toCssValue(width),
    height: toCssValue(height),
    background,
    borderRadius: toCssValue(border_radius),
  };
  const merged = { ...base, ...(style ? sanitizeStyle(style) : {}) };
  return (
    <div className={className} style={merged}>
      {children}
    </div>
  );
}
