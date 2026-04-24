'use client';

// Promo — banner (full-width), card (floating discount card), or countdown
// (same as card with an expiry timer). All respect tenant colors.

import { useEffect, useState } from 'react';
import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface PromoProps {
  headline?: string;
  body?: string;
  cta_label?: string;
  cta_href?: string;
  // ISO 8601 for the countdown variant, e.g. "2026-05-01T00:00:00+07:00".
  expires_at?: string;
  // Optional fine-print under the CTA (promo code, terms).
  fine_print?: string;
}

export function Promo({ section, ctx, props }: SectionComponentProps<PromoProps>) {
  if (section.variant === 'card') return <Card ctx={ctx} props={props} />;
  if (section.variant === 'countdown') return <Countdown ctx={ctx} props={props} />;
  return <Banner ctx={ctx} props={props} />;
}

function Banner({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: PromoProps }) {
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
        {props.fine_print && <p className="mt-3 text-[11px] opacity-70">{props.fine_print}</p>}
      </div>
    </section>
  );
}

function Card({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: PromoProps }) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className="max-w-md mx-auto rounded-3xl p-5 shadow-lg flex items-start gap-4"
        style={{
          background: `${ctx.colors.primary}`,
          color: ctx.colors.background,
          boxShadow: `0 12px 40px -16px ${ctx.colors.primary}55`,
        }}
      >
        <div
          className="h-12 w-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl"
          style={{ background: ctx.colors.background, color: ctx.colors.primary }}
          aria-hidden="true"
        >
          %
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <h3
            className="text-lg font-semibold leading-snug"
            style={{ fontFamily: 'var(--font-display, serif)' }}
          >
            {props.headline ?? 'Promo spesial'}
          </h3>
          {props.body && <p className="text-sm opacity-85">{props.body}</p>}
          <a
            href={props.cta_href ?? '/menu'}
            className="inline-block mt-1 px-4 h-9 leading-[36px] rounded-full text-xs font-medium"
            style={{ background: ctx.colors.background, color: ctx.colors.primary }}
          >
            {props.cta_label ?? 'Ambil promo'}
          </a>
          {props.fine_print && <p className="text-[10px] opacity-70 mt-1">{props.fine_print}</p>}
        </div>
      </div>
    </section>
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

  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className="max-w-md mx-auto rounded-3xl px-5 py-6 text-center"
        style={{
          background: ctx.colors.primary,
          color: ctx.colors.background,
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
            className="mt-4 inline-flex items-center gap-2 font-mono text-2xl font-semibold"
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
        {!expired && (
          <a
            href={props.cta_href ?? '/menu'}
            className="mt-5 inline-block px-5 h-11 leading-[44px] rounded-full text-sm font-medium"
            style={{ background: ctx.colors.background, color: ctx.colors.primary }}
          >
            {props.cta_label ?? 'Ambil sekarang'}
          </a>
        )}
        {props.fine_print && <p className="mt-3 text-[11px] opacity-70">{props.fine_print}</p>}
      </div>
    </section>
  );
}
