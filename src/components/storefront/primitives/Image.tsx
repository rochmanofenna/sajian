// Image — minimal styled <img>. URLs are filtered through the same
// http(s)-only / host-allowlist logic the safe-style module uses for
// background-image, so a javascript: src can never render.

import { type CSSProperties } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export interface ImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: Record<string, unknown>;
}

const IMAGE_HOST_ALLOWLIST = [
  /^([a-z0-9-]+\.)*supabase\.co$/,
  /^([a-z0-9-]+\.)*googleusercontent\.com$/,
  /^oaidalleapiprodscus\.blob\.core\.windows\.net$/,
  /^([a-z0-9-]+\.)*sajian\.app$/,
];

function safeSrc(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!IMAGE_HOST_ALLOWLIST.some((rx) => rx.test(u.hostname))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function Image({ src, alt, className, style }: ImageProps) {
  const url = safeSrc(src);
  if (!url) return null;
  const css: CSSProperties = style ? sanitizeStyle(style) : {};
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt ?? ''} className={className} style={css} />
  );
}
