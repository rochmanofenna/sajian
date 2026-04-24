// Text — thin styled wrapper. The `tag` picks the semantic element; the
// style bag goes through sanitizeStyle so the AI can set font-size,
// color, etc. without reaching the DOM unvalidated.

import { type CSSProperties } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export type TextTag = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'div';

export interface TextProps {
  tag?: TextTag;
  content?: string;
  className?: string;
  style?: Record<string, unknown>;
}

const MAX_CONTENT = 600;

export function Text({ tag = 'p', content = '', className, style }: TextProps) {
  const safe = content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) : content;
  const css: CSSProperties = style ? sanitizeStyle(style) : {};
  const Tag = tag as TextTag;
  return (
    <Tag className={className} style={css}>
      {safe}
    </Tag>
  );
}
