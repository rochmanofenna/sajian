// Shared CTA / alignment class helpers used by every section that exposes
// layout props. Keeps Hero / Promo / About / Contact in visual sync — the
// "sm" size on one section has the same height as "sm" on the others.

export type CtaSize = 'sm' | 'md' | 'lg';
export type Align = 'left' | 'center' | 'right';

export function ctaSizeClass(size?: CtaSize): string {
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

export function rowAlignClass(align?: Align): string {
  if (align === 'left') return 'justify-start';
  if (align === 'right') return 'justify-end';
  return 'justify-center';
}

export function textAlignClass(align?: Align): string {
  if (align === 'left') return 'text-left';
  if (align === 'right') return 'text-right';
  return 'text-center';
}

export function headingSizeClass(size?: CtaSize): string {
  switch (size) {
    case 'sm':
      return 'text-lg';
    case 'lg':
      return 'text-3xl md:text-4xl';
    case 'md':
    default:
      return 'text-2xl';
  }
}
