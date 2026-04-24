// About section — restaurant story / origin blurb. Variants: simple,
// with_image, story (timeline).

import type { SectionComponentProps } from '@/lib/storefront/section-types';

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
}

export function About({ section, ctx, props }: SectionComponentProps<AboutProps>) {
  if (section.variant === 'with_image') return <WithImage ctx={ctx} props={props} />;
  if (section.variant === 'story') return <Story ctx={ctx} props={props} />;
  return <Simple ctx={ctx} props={props} />;
}

function Simple({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: AboutProps }) {
  return (
    <section className="px-6 py-12" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-xl mx-auto space-y-3">
        <h2
          className="text-2xl font-semibold tracking-tight"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? `Tentang ${ctx.name}`}
        </h2>
        <p className="text-sm leading-relaxed opacity-80">
          {props.body ??
            `${ctx.name} hadir buat ngasih pengalaman bersantap yang hangat dan jujur. Setiap menu dibuat dengan bahan pilihan.`}
        </p>
      </div>
    </section>
  );
}

function WithImage({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: AboutProps }) {
  return (
    <section className="px-6 py-12" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2 items-center">
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
        <div className="space-y-3">
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
          >
            {props.heading ?? `Tentang ${ctx.name}`}
          </h2>
          <p className="text-sm leading-relaxed opacity-80">
            {props.body ??
              `${ctx.name} hadir buat ngasih pengalaman bersantap yang hangat dan jujur. Setiap menu dibuat dengan bahan pilihan.`}
          </p>
        </div>
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

  return (
    <section className="px-6 py-12" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <h2
          className="text-2xl font-semibold tracking-tight"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Perjalanan kami'}
        </h2>
        {props.body && <p className="text-sm leading-relaxed opacity-80">{props.body}</p>}
        <ol className="space-y-5 border-l" style={{ borderColor: `${ctx.colors.primary}30` }}>
          {entries.map((e, i) => (
            <li key={`${e.year}-${i}`} className="pl-5 relative">
              <span
                className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full"
                style={{ background: ctx.colors.primary }}
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
      </div>
    </section>
  );
}
