// About section — restaurant story / origin blurb.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface AboutProps {
  heading?: string;
  body?: string;
  image_url?: string;
}

export function About({ section, ctx, props }: SectionComponentProps<AboutProps>) {
  if (section.variant === 'with_image') return <WithImage ctx={ctx} props={props} />;
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
