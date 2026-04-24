// Hero section — 5 variants. Icon-only logo + CSS-rendered restaurant name
// so DALL·E text-garbling never shows up in the brand lockup.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface HeroProps {
  cta_label?: string;
  cta_href?: string;
  cta_size?: 'sm' | 'md' | 'lg';
  cta_align?: 'left' | 'center' | 'right';
  cta_visible?: boolean;
  subhead?: string;
}

function ctaSizeClass(size?: 'sm' | 'md' | 'lg'): string {
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

function ctaRowAlignClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'justify-start';
  if (align === 'right') return 'justify-end';
  return 'justify-center';
}

function ctaHidden(props: HeroProps): boolean {
  return props.cta_visible === false;
}

export function Hero({ section, ctx, props }: SectionComponentProps<HeroProps>) {
  switch (section.variant) {
    case 'minimal':
      return <Minimal ctx={ctx} props={props} />;
    case 'split':
      return <Split ctx={ctx} props={props} />;
    case 'fullscreen':
      return <Fullscreen ctx={ctx} props={props} />;
    case 'editorial':
      return <Editorial ctx={ctx} props={props} />;
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
        {!ctaHidden(props) && (
          <div className={`flex mt-3 ${ctaRowAlignClass(props.cta_align)}`}>
            <a
              href={props.cta_href ?? '/menu'}
              className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size)}`}
              style={{ background, color: primary }}
            >
              {props.cta_label ?? 'Lihat Menu →'}
            </a>
          </div>
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
        {!ctaHidden(props) && (
          <div className={`flex mt-2 ${ctaRowAlignClass(props.cta_align)}`}>
            <a
              href={props.cta_href ?? '/menu'}
              className={`inline-block rounded-full font-medium text-white ${ctaSizeClass(props.cta_size)}`}
              style={{ background: primary }}
            >
              {props.cta_label ?? 'Lihat Menu'}
            </a>
          </div>
        )}
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
          {!ctaHidden(props) && (
            <div className={`flex ${ctaRowAlignClass(props.cta_align ?? 'left')}`}>
              <a
                href={props.cta_href ?? '/menu'}
                className={`inline-block rounded-full font-medium text-white ${ctaSizeClass(props.cta_size)}`}
                style={{ background: primary }}
              >
                {props.cta_label ?? 'Lihat Menu →'}
              </a>
            </div>
          )}
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

function Fullscreen({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: HeroProps }) {
  const { primary, background, dark } = ctx.colors;
  return (
    <section
      className="relative overflow-hidden px-6 py-24 md:py-32 text-center"
      style={{ color: background, background: dark, minHeight: '72vh' }}
    >
      {ctx.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ctx.heroImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${primary} 0%, ${dark} 75%)`,
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 100%)`,
        }}
      />
      <div className="relative z-10 max-w-2xl mx-auto space-y-5">
        <Lockup ctx={ctx} />
        {ctx.tagline && (
          <p className="text-lg opacity-95 max-w-xl mx-auto leading-relaxed">
            {ctx.tagline}
          </p>
        )}
        {props.subhead && (
          <p className="text-sm opacity-80 max-w-lg mx-auto">{props.subhead}</p>
        )}
        {!ctaHidden(props) && (
          <div className={`flex mt-2 ${ctaRowAlignClass(props.cta_align)}`}>
            <a
              href={props.cta_href ?? '/menu'}
              className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size ?? 'lg')}`}
              style={{ background, color: primary }}
            >
              {props.cta_label ?? 'Lihat Menu →'}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function Editorial({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: HeroProps }) {
  const { primary, background, dark } = ctx.colors;
  return (
    <section className="px-6 py-14" style={{ background, color: dark }}>
      <div className="max-w-4xl mx-auto">
        <div className="grid gap-10 md:grid-cols-12 items-end">
          <div className="md:col-span-7 space-y-5">
            <div
              className="text-xs uppercase tracking-[0.28em]"
              style={{ color: primary, fontFamily: 'var(--font-mono, monospace)' }}
            >
              Est. {new Date().getFullYear()} · Sajian
            </div>
            <h1
              className="text-5xl md:text-6xl font-semibold leading-[1.02] tracking-tight"
              style={{ fontFamily: 'var(--font-display, serif)' }}
            >
              {ctx.name}
            </h1>
            {ctx.tagline && (
              <p className="text-base opacity-75 max-w-md leading-relaxed">
                {ctx.tagline}
              </p>
            )}
            <div
              className={`flex items-center gap-4 ${ctaRowAlignClass(
                props.cta_align ?? 'left',
              )}`}
            >
              {!ctaHidden(props) && (
                <a
                  href={props.cta_href ?? '/menu'}
                  className={`inline-block rounded-full font-medium text-white ${ctaSizeClass(
                    props.cta_size,
                  )}`}
                  style={{ background: primary }}
                >
                  {props.cta_label ?? 'Lihat Menu'}
                </a>
              )}
              {ctx.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ctx.logoUrl}
                  alt=""
                  className="h-10 w-10 rounded-xl object-cover"
                  style={{ border: `1px solid ${primary}30` }}
                />
              )}
            </div>
          </div>
          <div className="md:col-span-5">
            <div
              className="aspect-[3/4] rounded-xl overflow-hidden"
              style={{ background: `${primary}14`, border: `1px solid ${primary}22` }}
            >
              {ctx.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ctx.heroImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center opacity-40 text-xs uppercase tracking-wider">
                  Foto hero
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
