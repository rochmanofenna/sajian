// Overlay — absolutely positions children inside a `position:relative`
// parent using anchor+offset semantics. Safe for any section that needs
// floating content (badges, corner CTAs, etc.).

import { type CSSProperties, type ReactNode } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export type OverlayAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center'
  | 'center-left'
  | 'center-right'
  | 'center';

export interface OverlayProps {
  anchor?: OverlayAnchor;
  offset_x?: number;
  offset_y?: number;
  z?: number;
  className?: string;
  style?: Record<string, unknown>;
  children?: ReactNode;
}

function clamp(n: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function anchorStyle(
  anchor: OverlayAnchor,
  offsetX: number,
  offsetY: number,
): CSSProperties {
  const style: CSSProperties = { position: 'absolute' };
  switch (anchor) {
    case 'top-left':
      style.top = offsetY;
      style.left = offsetX;
      break;
    case 'top-right':
      style.top = offsetY;
      style.right = offsetX;
      break;
    case 'bottom-left':
      style.bottom = offsetY;
      style.left = offsetX;
      break;
    case 'bottom-right':
      style.bottom = offsetY;
      style.right = offsetX;
      break;
    case 'top-center':
      style.top = offsetY;
      style.left = '50%';
      style.transform = `translate(-50%, 0) translate(${offsetX}px, 0)`;
      break;
    case 'bottom-center':
      style.bottom = offsetY;
      style.left = '50%';
      style.transform = `translate(-50%, 0) translate(${offsetX}px, 0)`;
      break;
    case 'center-left':
      style.top = '50%';
      style.left = offsetX;
      style.transform = `translate(0, -50%) translate(0, ${offsetY}px)`;
      break;
    case 'center-right':
      style.top = '50%';
      style.right = offsetX;
      style.transform = `translate(0, -50%) translate(0, ${offsetY}px)`;
      break;
    case 'center':
    default:
      style.top = '50%';
      style.left = '50%';
      style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
      break;
  }
  return style;
}

export function Overlay({
  anchor = 'center',
  offset_x,
  offset_y,
  z,
  className,
  style,
  children,
}: OverlayProps) {
  const x = clamp(offset_x, -500, 500, 0);
  const y = clamp(offset_y, -500, 500, 0);
  const zi = clamp(z, 0, 50, 10);
  const merged: CSSProperties = {
    ...anchorStyle(anchor, x, y),
    zIndex: zi,
    ...(style ? sanitizeStyle(style) : {}),
  };
  return (
    <div className={className} style={merged}>
      {children}
    </div>
  );
}
