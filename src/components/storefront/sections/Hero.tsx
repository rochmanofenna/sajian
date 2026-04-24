// Hero section — 3 variants. Icon-only logo + CSS-rendered restaurant name
// so DALL·E text-garbling never shows up in the brand lockup.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface HeroProps {
  cta_label?: string;
  cta_href?: string;
  subhead?: string;
}

export function Hero({ section, ctx, props }: SectionComponentProps<HeroProps>) {
  switch (section.variant) {
    case 'minimal':
      return <Minimal ctx={ctx} props={props} />;
    case 'split':
      return <Split ctx={ctx} props={props} />;
    case 'gradient':
    default:
      return <Gradient ctx={ctx} props={props} />;
  }
}

function Lockup({ ctx, align = 'center' }: { ctx: SectionComponentProps['ctx']; align?: 'center' | 'left' }) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      {ctx.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ctx.logoUrl}
          alt=""
          className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/30"
        />
      )}
      <span
        className="text-3xl font-semibold tracking-tight"
        style={{ fontFamily: 'var(--font-display, serif)' }}
      >
        {ctx.name}
      </span>
    </div>
  );
}

function Gradient({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: HeroProps }) {
  const { primary, dark, background } = ctx.colors;
  return (
    <section
      className="relative py-20 px-6 text-center overflow-hidden"
      style={{
        background: `linear-gradient(165deg, ${primary} 0%, ${dark} 120%)`,
        color: background,
      }}
    >
      {ctx.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ctx.heroImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
      )}
      <div className="relative z-10 space-y-4">
        <Lockup ctx={ctx} />
        {ctx.tagline && <p className="text-base opacity-85 max-w-md mx-auto">{ctx.tagline}</p>}
        {props.subhead && <p className="text-sm opacity-70 max-w-md mx-auto">{props.subhead}</p>}
        {(props.cta_label || 'Lihat Menu') && (
          <a
            href={props.cta_href ?? '/menu'}
            className="inline-block mt-3 px-6 h-11 leading-[44px] rounded-full font-medium"
            style={{ background: background, color: primary }}
          >
            {props.cta_label ?? 'Lihat Menu →'}
          </a>
        )}
      </div>
    </section>
  );
}

function Minimal({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: HeroProps }) {
  const { primary, background } = ctx.colors;
  return (
    <section className="px-6 py-14 text-center" style={{ background, color: primary }}>
      <div className="space-y-3">
        <Lockup ctx={ctx} />
        {ctx.tagline && <p className="text-sm opacity-70 max-w-sm mx-auto">{ctx.tagline}</p>}
        <a
          href={props.cta_href ?? '/menu'}
          className="inline-block mt-2 px-6 h-10 leading-[40px] rounded-full text-sm font-medium text-white"
          style={{ background: primary }}
        >
          {props.cta_label ?? 'Lihat Menu'}
        </a>
      </div>
    </section>
  );
}

function Split({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: HeroProps }) {
  const { primary, background } = ctx.colors;
  return (
    <section className="px-6 py-10" style={{ background, color: primary }}>
      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2 items-center">
        <div className="space-y-4">
          <Lockup ctx={ctx} align="left" />
          {ctx.tagline && <p className="text-base opacity-80">{ctx.tagline}</p>}
          {props.subhead && <p className="text-sm opacity-60">{props.subhead}</p>}
          <a
            href={props.cta_href ?? '/menu'}
            className="inline-block px-5 h-11 leading-[44px] rounded-full text-sm font-medium text-white"
            style={{ background: primary }}
          >
            {props.cta_label ?? 'Lihat Menu →'}
          </a>
        </div>
        <div
          className="aspect-[4/3] rounded-3xl overflow-hidden"
          style={{ background: `${primary}18` }}
        >
          {ctx.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ctx.heroImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center opacity-40 text-sm">
              Foto hero muncul di sini
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
