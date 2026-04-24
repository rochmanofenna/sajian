// Stack — constrained flex layout primitive. Only the token vocabulary
// below is accepted; `gap` is rounded to the nearest allowed token so a
// bad AI emit doesn't produce a rogue 37-pixel gap.

import { type CSSProperties, type ReactNode } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export type StackDirection = 'row' | 'col';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around';
export type StackGap = 0 | 2 | 4 | 6 | 8 | 12 | 16 | 24 | 32;

const ALLOWED_GAPS: readonly StackGap[] = [0, 2, 4, 6, 8, 12, 16, 24, 32];

export interface StackProps {
  direction?: StackDirection;
  align?: StackAlign;
  justify?: StackJustify;
  gap?: StackGap;
  wrap?: boolean;
  className?: string;
  style?: Record<string, unknown>;
  children?: ReactNode;
}

function snapGap(gap: StackGap | number | undefined): number {
  if (typeof gap !== 'number') return 0;
  if ((ALLOWED_GAPS as readonly number[]).includes(gap)) return gap;
  // Snap to the closest allowed value rather than dropping it — UX is
  // better than a bare stack with no spacing.
  return ALLOWED_GAPS.reduce((best, candidate) =>
    Math.abs(candidate - gap) < Math.abs(best - gap) ? candidate : best,
  );
}

function alignToFlex(a: StackAlign): CSSProperties['alignItems'] {
  if (a === 'start') return 'flex-start';
  if (a === 'end') return 'flex-end';
  if (a === 'stretch') return 'stretch';
  return 'center';
}

function justifyToFlex(j: StackJustify): CSSProperties['justifyContent'] {
  if (j === 'start') return 'flex-start';
  if (j === 'end') return 'flex-end';
  if (j === 'between') return 'space-between';
  if (j === 'around') return 'space-around';
  return 'center';
}

export function Stack({
  direction = 'col',
  align = 'stretch',
  justify = 'start',
  gap = 0,
  wrap,
  className,
  style,
  children,
}: StackProps) {
  const merged: CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'row' ? 'row' : 'column',
    alignItems: alignToFlex(align),
    justifyContent: justifyToFlex(justify),
    gap: snapGap(gap),
    flexWrap: wrap ? 'wrap' : 'nowrap',
    ...(style ? sanitizeStyle(style) : {}),
  };
  return (
    <div className={className} style={merged}>
      {children}
    </div>
  );
}
