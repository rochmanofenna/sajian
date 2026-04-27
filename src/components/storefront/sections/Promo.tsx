'use client';

// Promo — banner (full-width), card (floating discount card), countdown
// (timer), or floating (fixed-position dismissible). All respect tenant
// colors and expose cta_* / banner_align / emphasis props so the AI can
// route layout requests through update_section_props instead of refusing.
//
// Vertical rhythm follows the scale in docs/codegen-audit-2026-04-27.md
// (Layer 1.3): py-16 default. Inner card paddings (rounded-3xl px-6 py-8,
// max-w-md mx-auto rounded-3xl px-5 py-6, fixed floating chip px-4 py-4)
// are intentional inner-surface treatments, not section vertical rhythm,
// and stay as authored.

import { useEffect, useState } from 'react';
import type { SectionComponentProps } from '@/lib/storefront/section-types';
import {
  ctaSizeClass,
  rowAlignClass,
  textAlignClass,
  type Align,
  type CtaSize,
} from './cta';
import { SlotRenderer } from '@/components/storefront/SlotRenderer';

interface PromoProps {
  headline?: string;
  body?: string;
  cta_label?: string;
  cta_href?: string;
  cta_size?: CtaSize;
  cta_align?: Align;
  cta_visible?: boolean;
  // Alignment of the headline + body text (independent of the CTA row).
  banner_align?: Align;
  // `subtle` tones the gradient way down — useful when the promo should
  // read as an accent, not a screaming banner.
  emphasis?: 'subtle' | 'bold';
  // ISO 8601 for the countdown variant, e.g. "2026-05-01T00:00:00+07:00".
  expires_at?: string;
  // Optional fine-print under the CTA (promo code, terms).
  fine_print?: string;
  // Phase 1 slot hook: a small SlotNode tree rendered next to the
  // headline (useful for an icon + small label like "Baru!").
  badge_slot?: unknown;
}

function ctaHidden(props: PromoProps): boolean {
  return props.cta_visible === false;
}

function bannerBackground(
  ctx: SectionComponentProps['ctx'],
  emphasis?: 'subtle' | 'bold',
) {
  if (emphasis === 'subtle') {
    return {
      background: `${ctx.colors.primary}12`,
      color: ctx.colors.dark,
    };
  }
  return {
    background: `linear-gradient(135deg, ${ctx.colors.primary} 0%, ${ctx.colors.dark} 140%)`,
    color: ctx.colors.background,
  };
}

export function Promo({ section, ctx, props }: SectionComponentProps<PromoProps>) {
  if (section.variant === 'card') return <Card ctx={ctx} props={props} />;
  if (section.variant === 'countdown') return <Countdown ctx={ctx} props={props} />;
  if (section.variant === 'floating') return <FloatingClient ctx={ctx} props={props} />;
  return <Banner ctx={ctx} props={props} />;
}

function Banner({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: PromoProps }) {
  const subtle = props.emphasis === 'subtle';
  return (
    <section
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className={`max-w-4xl mx-auto rounded-3xl px-6 py-8 ${textAlignClass(
          props.banner_align,
        )}`}
        style={bannerBackground(ctx, props.emphasis)}
      >
        {typeof props.badge_slot !== 'undefined' && (
          <div className="mb-3 flex justify-center">
            <SlotRenderer tree={props.badge_slot as unknown} />
          </div>
        )}
        <h2
          className="text-2xl font-semibold tracking-tight"
          style={{ fontFamily: 'var(--font-display, serif)' }}
        >
          {props.headline ?? 'Promo spesial'}
        </h2>
        {props.body && <p className="mt-2 text-sm opacity-85">{props.body}</p>}
        {!ctaHidden(props) && (
          <div className={`flex mt-4 ${rowAlignClass(props.cta_align ?? props.banner_align)}`}>
            <a
              href={props.cta_href ?? '/menu'}
              className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size)}`}
              style={
                subtle
                  ? { background: ctx.colors.primary, color: ctx.colors.background }
                  : { background: ctx.colors.background, color: ctx.colors.primary }
              }
            >
              {props.cta_label ?? 'Pesan Sekarang'}
            </a>
          </div>
        )}
        {props.fine_print && <p className="mt-3 text-[11px] opacity-70">{props.fine_print}</p>}
      </div>
    </section>
  );
}

function Card({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: PromoProps }) {
  const subtle = props.emphasis === 'subtle';
  return (
    <section
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className="max-w-md mx-auto rounded-3xl p-5 shadow-lg flex items-start gap-4"
        style={{
          background: subtle ? `${ctx.colors.primary}14` : ctx.colors.primary,
          color: subtle ? ctx.colors.dark : ctx.colors.background,
          boxShadow: `0 12px 40px -16px ${ctx.colors.primary}55`,
        }}
      >
        <div
          className="h-12 w-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl"
          style={{
            background: subtle ? ctx.colors.primary : ctx.colors.background,
            color: subtle ? ctx.colors.background : ctx.colors.primary,
          }}
          aria-hidden="true"
        >
          %
        </div>
        <div className={`flex-1 min-w-0 space-y-2 ${textAlignClass(props.banner_align ?? 'left')}`}>
          <h3
            className="text-lg font-semibold leading-snug"
            style={{ fontFamily: 'var(--font-display, serif)' }}
          >
            {props.headline ?? 'Promo spesial'}
          </h3>
          {props.body && <p className="text-sm opacity-85">{props.body}</p>}
          {!ctaHidden(props) && (
            <div className={`flex ${rowAlignClass(props.cta_align ?? props.banner_align ?? 'left')}`}>
              <a
                href={props.cta_href ?? '/menu'}
                className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size ?? 'sm')}`}
                style={
                  subtle
                    ? { background: ctx.colors.primary, color: ctx.colors.background }
                    : { background: ctx.colors.background, color: ctx.colors.primary }
                }
              >
                {props.cta_label ?? 'Ambil promo'}
              </a>
            </div>
          )}
          {props.fine_print && <p className="text-[10px] opacity-70 mt-1">{props.fine_print}</p>}
        </div>
      </div>
    </section>
  );
}

// Fixed-position dismissible card. Renders at the bottom-right of the
// viewport; a per-headline localStorage key remembers the dismissal so
// returning customers see a fresh promo when the owner changes the
// headline but don't get nagged every session for the same one.
function FloatingClient({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: PromoProps }) {
  const key = `sajian:promo-floating:${(props.headline ?? 'promo').slice(0, 40)}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(key)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [key]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // private mode — best effort.
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed z-30 max-w-xs rounded-2xl px-4 py-4 shadow-xl"
      style={{
        right: 16,
        bottom: 16,
        background: ctx.colors.primary,
        color: ctx.colors.background,
        boxShadow: `0 12px 32px -12px ${ctx.colors.primary}66`,
      }}
      role="complementary"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup promo"
        className="absolute top-2 right-3 opacity-80 hover:opacity-100"
        style={{ color: ctx.colors.background }}
      >
        ×
      </button>
      <div
        className="text-sm font-semibold tracking-tight"
        style={{ fontFamily: 'var(--font-display, serif)' }}
      >
        {props.headline ?? 'Ada penawaran'}
      </div>
      {props.body && <p className="text-xs opacity-85 mt-1 leading-relaxed">{props.body}</p>}
      {props.cta_visible !== false && (
        <a
          href={props.cta_href ?? '/menu'}
          className="mt-3 inline-block px-4 h-9 leading-[36px] rounded-full text-xs font-medium"
          style={{ background: ctx.colors.background, color: ctx.colors.primary }}
          onClick={dismiss}
        >
          {props.cta_label ?? 'Lihat menu'}
        </a>
      )}
    </div>
  );
}

function Countdown({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: PromoProps }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = props.expires_at ? new Date(props.expires_at).getTime() : null;
  const remaining = target ? Math.max(0, target - now) : null;

  function part(ms: number, div: number, mod: number) {
    return Math.floor((ms / div) % mod)
      .toString()
      .padStart(2, '0');
  }

  const expired = remaining !== null && remaining <= 0;
  const subtle = props.emphasis === 'subtle';

  return (
    <section
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className={`max-w-md mx-auto rounded-3xl px-5 py-6 ${textAlignClass(
          props.banner_align,
        )}`}
        style={{
          background: subtle ? `${ctx.colors.primary}14` : ctx.colors.primary,
          color: subtle ? ctx.colors.dark : ctx.colors.background,
        }}
      >
        <h3
          className="text-lg font-semibold tracking-tight"
          style={{ fontFamily: 'var(--font-display, serif)' }}
        >
          {props.headline ?? 'Promo terbatas'}
        </h3>
        {props.body && <p className="mt-1 text-sm opacity-85">{props.body}</p>}
        {remaining !== null && !expired && (
          <div
            className={`mt-4 inline-flex items-center gap-2 font-mono text-2xl font-semibold ${
              props.banner_align === 'left'
                ? ''
                : props.banner_align === 'right'
                  ? 'ml-auto'
                  : 'mx-auto'
            }`}
            aria-live="polite"
          >
            <span>{part(remaining, 1000 * 60 * 60 * 24, 99)}</span>
            <span className="opacity-60">h</span>
            <span>{part(remaining, 1000 * 60 * 60, 24)}</span>
            <span className="opacity-60">:</span>
            <span>{part(remaining, 1000 * 60, 60)}</span>
            <span className="opacity-60">:</span>
            <span>{part(remaining, 1000, 60)}</span>
          </div>
        )}
        {expired && <p className="mt-3 text-sm opacity-75">Promo sudah berakhir.</p>}
        {!expired && !ctaHidden(props) && (
          <div className={`flex mt-5 ${rowAlignClass(props.cta_align ?? props.banner_align)}`}>
            <a
              href={props.cta_href ?? '/menu'}
              className={`inline-block rounded-full font-medium ${ctaSizeClass(props.cta_size)}`}
              style={
                subtle
                  ? { background: ctx.colors.primary, color: ctx.colors.background }
                  : { background: ctx.colors.background, color: ctx.colors.primary }
              }
            >
              {props.cta_label ?? 'Ambil sekarang'}
            </a>
          </div>
        )}
        {props.fine_print && <p className="mt-3 text-[11px] opacity-70">{props.fine_print}</p>}
      </div>
    </section>
  );
}
