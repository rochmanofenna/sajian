// Hero section — 5 variants. Icon-only logo + CSS-rendered restaurant name
// so DALL·E text-garbling never shows up in the brand lockup.
//
// Vertical rhythm (Layer 1.3, 2026-04-27):
//   py-16              — default top-level section padding
//   py-24 md:py-32     — Fullscreen variant only (deliberate cinematic statement)
//   py-12              — reserved for tight sections (do not introduce here)
// Do not introduce new py-N values without updating the scale in
// docs/codegen-audit-2026-04-27.md.

import type { SectionComponentProps } from '@/lib/storefront/section-types';
import { ctaSizeClass, rowAlignClass, type Align, type CtaSize } from './cta';

type VAlign = 'top' | 'middle' | 'bottom';

interface HeroProps {
  cta_label?: string;
  cta_href?: string;
  cta_size?: CtaSize;
  cta_align?: Align;
  cta_vertical?: VAlign;
  cta_visible?: boolean;
  content_vertical?: VAlign;
  subhead?: string;
}

// Local alias kept so the rest of this file reads the same as before.
const ctaRowAlignClass = rowAlignClass;

function ctaHidden(props: HeroProps): boolean {
  return props.cta_visible === false;
}

function vAlignClass(v?: VAlign): string {
  if (v === 'top') return 'justify-start';
  if (v === 'bottom') return 'justify-end';
  return 'justify-center';
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
  // Below 480px the logo + tenant name overflowed in a single row for
  // longer brand names ("Sandwicherie Lakeside", etc.) — the row clipped
  // on the right edge of the hero. Stack vertically on narrow viewports
  // and reflow to a row at ≥480px. Also drops the name font-size one
  // step on mobile so very long names don't blow out a single line.
  const isCenter = align === 'center';
  return (
    <div
      className={`flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-3 ${
        isCenter
          ? 'items-center text-center min-[480px]:justify-center'
          : 'items-start min-[480px]:justify-start'
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
        className="text-2xl min-[480px]:text-3xl font-semibold tracking-tight"
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
      className="relative py-16 px-6 text-center overflow-hidden"
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
    <section className="px-6 py-16 text-center" style={{ background, color: primary }}>
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
    <section className="px-6 py-16" style={{ background, color: primary }}>
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
  const ctaBottom = props.cta_vertical === 'bottom';
  const ctaTop = props.cta_vertical === 'top';
  const contentV = props.content_vertical ?? 'middle';
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
      <div className={`absolute inset-0 flex flex-col ${vAlignClass(contentV)} px-6`}>
        <div className="relative z-10 max-w-2xl mx-auto space-y-5 w-full">
          <Lockup ctx={ctx} />
          {ctx.tagline && (
            <p className="text-lg opacity-95 max-w-xl mx-auto leading-relaxed">
              {ctx.tagline}
            </p>
          )}
          {props.subhead && (
            <p className="text-sm opacity-80 max-w-lg mx-auto">{props.subhead}</p>
          )}
          {!ctaHidden(props) && !ctaBottom && !ctaTop && (
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
      </div>
      {!ctaHidden(props) && (ctaBottom || ctaTop) && (
        <div
          className={`absolute inset-x-0 z-10 flex px-6 ${ctaRowAlignClass(props.cta_align)}`}
          style={ctaBottom ? { bottom: 32 } : { top: 32 }}
        >
          <a
            href={props.cta_href ?? '/menu'}
            className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size ?? 'lg')}`}
            style={{ background, color: primary }}
          >
            {props.cta_label ?? 'Lihat Menu →'}
          </a>
        </div>
      )}
    </section>
  );
}

function Editorial({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: HeroProps }) {
  const { primary, background, dark } = ctx.colors;
  return (
    <section className="px-6 py-16" style={{ background, color: dark }}>
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
