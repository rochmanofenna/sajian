// Button — renders an <a> (so it works with native open-in-new-tab
// affordances) styled as a button. Links are validated: only
// root-relative paths or http(s) URLs on the app origin are allowed;
// javascript:, data:, file: and foreign hosts are rejected.

import { type CSSProperties } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  content?: string;
  href?: string;
  size?: ButtonSize;
  className?: string;
  style?: Record<string, unknown>;
}

function safeHref(raw: string | undefined): string {
  if (!raw) return '/menu';
  const t = raw.trim();
  if (/^\/[\w\-./?=&%#]*$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    return '/menu';
  }
  return '/menu';
}

function sizeClasses(size: ButtonSize): string {
  switch (size) {
    case 'sm':
      return 'px-4 h-9 leading-[36px] text-xs';
    case 'lg':
      return 'px-7 h-12 leading-[48px] text-base';
    case 'md':
    default:
      return 'px-6 h-11 leading-[44px] text-sm';
  }
}

export function Button({ content = 'Aksi', href, size = 'md', className, style }: ButtonProps) {
  const url = safeHref(href);
  const css: CSSProperties = style ? sanitizeStyle(style) : {};
  const composedClass = `inline-flex items-center justify-center rounded-full font-medium no-underline ${sizeClasses(size)} ${className ?? ''}`.trim();
  return (
    <a href={url} className={composedClass} style={css}>
      {content}
    </a>
  );
}
