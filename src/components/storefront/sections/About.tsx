// About section — restaurant story / origin blurb. Variants: simple,
// with_image, story (timeline). Exposes text_align, image_position,
// heading_size, cta_* props so the AI can route layout requests through
// update_section_props.

import type { SectionComponentProps } from '@/lib/storefront/section-types';
import {
  ctaSizeClass,
  headingSizeClass,
  rowAlignClass,
  textAlignClass,
  type Align,
  type CtaSize,
} from './cta';
import { SlotRenderer } from '@/components/storefront/SlotRenderer';

interface TimelineEntry {
  year: string;
  title: string;
  body?: string;
}

interface AboutProps {
  heading?: string;
  body?: string;
  image_url?: string;
  timeline?: TimelineEntry[];
  text_align?: Align;
  image_position?: 'left' | 'right';
  heading_size?: CtaSize;
  cta_label?: string;
  cta_href?: string;
  cta_size?: CtaSize;
  cta_align?: Align;
  // Opt-in — About is primarily copy; the CTA only renders when truthy.
  cta_visible?: boolean;
  // Phase 1 slot hook: a small tree rendered next to / under the body
  // (useful for a credentials badge, social proof, etc.).
  aside_slot?: unknown;
}

function ctaVisible(props: AboutProps): boolean {
  return props.cta_visible === true && Boolean(props.cta_label);
}

function Cta({
  ctx,
  props,
}: {
  ctx: SectionComponentProps['ctx'];
  props: AboutProps;
}) {
  if (!ctaVisible(props)) return null;
  return (
    <div className={`flex mt-2 ${rowAlignClass(props.cta_align ?? props.text_align ?? 'left')}`}>
      <a
        href={props.cta_href ?? '/menu'}
        className={`inline-block rounded-full font-medium text-white ${ctaSizeClass(props.cta_size)}`}
        style={{ background: ctx.colors.primary }}
      >
        {props.cta_label}
      </a>
    </div>
  );
}

export function About({ section, ctx, props }: SectionComponentProps<AboutProps>) {
  const base = (() => {
    if (section.variant === 'with_image') return <WithImage ctx={ctx} props={props} />;
    if (section.variant === 'story') return <Story ctx={ctx} props={props} />;
    return <Simple ctx={ctx} props={props} />;
  })();
  if (!props.aside_slot) return base;
  return (
    <>
      {base}
      <div className="px-6 pb-10 -mt-4" style={{ background: ctx.colors.background }}>
        <div className="max-w-2xl mx-auto">
          <SlotRenderer tree={props.aside_slot} />
        </div>
      </div>
    </>
  );
}

function Simple({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: AboutProps }) {
  const align = props.text_align ?? 'left';
  return (
    <section className="px-6 py-12" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className={`max-w-xl mx-auto space-y-3 ${textAlignClass(align)}`}>
        <h2
          className={`font-semibold tracking-tight ${headingSizeClass(props.heading_size)}`}
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? `Tentang ${ctx.name}`}
        </h2>
        <p className="text-sm leading-relaxed opacity-80">
          {props.body ??
            `${ctx.name} hadir buat ngasih pengalaman bersantap yang hangat dan jujur. Setiap menu dibuat dengan bahan pilihan.`}
        </p>
        <Cta ctx={ctx} props={props} />
      </div>
    </section>
  );
}

function WithImage({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: AboutProps }) {
  const imageLeft = props.image_position === 'left';
  const align = props.text_align ?? 'left';
  const imageBlock = (
    <div
      className="aspect-square rounded-3xl overflow-hidden"
      style={{ background: `${ctx.colors.primary}18` }}
    >
      {(props.image_url ?? ctx.heroImageUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.image_url ?? ctx.heroImageUrl!}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center opacity-40 text-sm">
          Foto suasana
        </div>
      )}
    </div>
  );
  const copyBlock = (
    <div className={`space-y-3 ${textAlignClass(align)}`}>
      <h2
        className={`font-semibold tracking-tight ${headingSizeClass(props.heading_size)}`}
        style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
      >
        {props.heading ?? `Tentang ${ctx.name}`}
      </h2>
      <p className="text-sm leading-relaxed opacity-80">
        {props.body ??
          `${ctx.name} hadir buat ngasih pengalaman bersantap yang hangat dan jujur. Setiap menu dibuat dengan bahan pilihan.`}
      </p>
      <Cta ctx={ctx} props={props} />
    </div>
  );
  return (
    <section className="px-6 py-12" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2 items-center">
        {imageLeft ? imageBlock : copyBlock}
        {imageLeft ? copyBlock : imageBlock}
      </div>
    </section>
  );
}

function Story({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: AboutProps }) {
  const entries: TimelineEntry[] =
    props.timeline?.length
      ? props.timeline
      : [
          { year: '2021', title: 'Awal', body: `${ctx.name} dimulai dari dapur rumah, satu resep keluarga.` },
          { year: '2023', title: 'Tumbuh', body: 'Pindah ke gerai pertama; pelanggan tetap jadi teman tiap hari.' },
          { year: new Date().getFullYear().toString(), title: 'Sekarang', body: 'Online di Sajian supaya kamu bisa pesan dari HP.' },
        ];

  const align = props.text_align ?? 'left';

  return (
    <section className="px-6 py-12" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className={`max-w-2xl mx-auto space-y-6 ${textAlignClass(align)}`}>
        <h2
          className={`font-semibold tracking-tight ${headingSizeClass(props.heading_size)}`}
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Perjalanan kami'}
        </h2>
        {props.body && <p className="text-sm leading-relaxed opacity-80">{props.body}</p>}
        <ol
          className={`space-y-5 border-l ${
            align === 'right' ? 'pr-5 ml-auto text-right' : 'pl-5'
          }`}
          style={{ borderColor: `${ctx.colors.primary}30` }}
        >
          {entries.map((e, i) => (
            <li key={`${e.year}-${i}`} className="relative">
              <span
                className="absolute top-1.5 h-2.5 w-2.5 rounded-full"
                style={{
                  background: ctx.colors.primary,
                  left: align === 'right' ? 'auto' : '-21px',
                  right: align === 'right' ? '-21px' : 'auto',
                }}
              />
              <div
                className="text-xs uppercase tracking-[0.2em] opacity-60"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              >
                {e.year}
              </div>
              <div className="text-base font-semibold mt-0.5">{e.title}</div>
              {e.body && <p className="text-sm opacity-75 mt-1 leading-relaxed">{e.body}</p>}
            </li>
          ))}
        </ol>
        <Cta ctx={ctx} props={props} />
      </div>
    </section>
  );
}
