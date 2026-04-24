// Promo — banner with a pitch + optional CTA.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface PromoProps {
  headline?: string;
  body?: string;
  cta_label?: string;
  cta_href?: string;
}

export function Promo({ ctx, props }: SectionComponentProps<PromoProps>) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className="max-w-4xl mx-auto rounded-3xl px-6 py-8 text-center"
        style={{
          background: `linear-gradient(135deg, ${ctx.colors.primary} 0%, ${ctx.colors.dark} 140%)`,
          color: ctx.colors.background,
        }}
      >
        <h2
          className="text-2xl font-semibold tracking-tight"
          style={{ fontFamily: 'var(--font-display, serif)' }}
        >
          {props.headline ?? 'Promo spesial'}
        </h2>
        {props.body && <p className="mt-2 text-sm opacity-85">{props.body}</p>}
        <a
          href={props.cta_href ?? '/menu'}
          className="mt-4 inline-block px-5 h-11 leading-[44px] rounded-full text-sm font-medium"
          style={{ background: ctx.colors.background, color: ctx.colors.primary }}
        >
          {props.cta_label ?? 'Pesan sekarang'}
        </a>
      </div>
    </section>
  );
}
