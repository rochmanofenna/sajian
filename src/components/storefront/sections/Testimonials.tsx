// Testimonials — customer reviews. Variants: cards (horizontal scroll),
// quotes (single big pullquote), grid (2-column short reviews).
//
// Vertical rhythm follows the scale in docs/codegen-audit-2026-04-27.md
// (Layer 1.3): py-16 default.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface Review {
  name: string;
  text: string;
  rating?: number;
}

interface TestimonialsProps {
  heading?: string;
  reviews?: Review[];
}

const DEFAULT_REVIEWS: Review[] = [
  { name: 'Budi S.', text: 'Makanannya enak banget, porsinya pas, dan bisa pesan langsung dari HP. Recommended!', rating: 5 },
  { name: 'Ibu Wati', text: 'Saya sering pesan untuk catering kantor. Selalu on-time dan rasanya konsisten.', rating: 5 },
  { name: 'Pak Hendro', text: 'Fresh, bersih, dan harga masih masuk akal. Cocok buat makan siang cepat.', rating: 4 },
];

function Stars({ n = 5, color }: { n?: number; color: string }) {
  const count = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span aria-label={`${count} dari 5 bintang`} className="text-sm" style={{ color }}>
      {'★'.repeat(count)}
      <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - count)}</span>
    </span>
  );
}

export function Testimonials({ section, ctx, props }: SectionComponentProps<TestimonialsProps>) {
  const reviews = props.reviews?.length ? props.reviews : DEFAULT_REVIEWS;
  switch (section.variant) {
    case 'quotes':
      return <Quotes ctx={ctx} props={props} reviews={reviews} />;
    case 'grid':
      return <Grid ctx={ctx} props={props} reviews={reviews} />;
    case 'cards':
    default:
      return <Cards ctx={ctx} props={props} reviews={reviews} />;
  }
}

function Header({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: TestimonialsProps }) {
  return (
    <h2
      className="text-xl font-semibold tracking-tight mb-4"
      style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
    >
      {props.heading ?? 'Kata pelanggan'}
    </h2>
  );
}

function Cards({ ctx, props, reviews }: { ctx: SectionComponentProps['ctx']; props: TestimonialsProps; reviews: Review[] }) {
  return (
    <section className="px-6 py-16" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 snap-x">
          {reviews.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="w-72 flex-shrink-0 snap-start rounded-2xl bg-white p-4 border"
              style={{ borderColor: `${ctx.colors.primary}20` }}
            >
              <Stars n={r.rating ?? 5} color={ctx.colors.accent} />
              <p className="mt-2 text-sm leading-relaxed opacity-85">{r.text}</p>
              <p className="mt-3 text-xs font-medium" style={{ color: ctx.colors.primary }}>
                — {r.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Quotes({ ctx, props, reviews }: { ctx: SectionComponentProps['ctx']; props: TestimonialsProps; reviews: Review[] }) {
  const hero = reviews[0];
  return (
    <section className="px-6 py-16" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-2xl mx-auto text-center space-y-5">
        <Header ctx={ctx} props={props} />
        <blockquote
          className="text-2xl leading-snug italic"
          style={{ fontFamily: 'var(--font-display, serif)', color: ctx.colors.dark }}
        >
          &ldquo;{hero.text}&rdquo;
        </blockquote>
        <div className="flex items-center justify-center gap-3">
          <Stars n={hero.rating ?? 5} color={ctx.colors.accent} />
          <span className="text-sm opacity-70">— {hero.name}</span>
        </div>
      </div>
    </section>
  );
}

function Grid({ ctx, props, reviews }: { ctx: SectionComponentProps['ctx']; props: TestimonialsProps; reviews: Review[] }) {
  return (
    <section className="px-6 py-16" style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
      <div className="max-w-3xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reviews.slice(0, 4).map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="rounded-2xl bg-white p-4 border"
              style={{ borderColor: `${ctx.colors.primary}20` }}
            >
              <Stars n={r.rating ?? 5} color={ctx.colors.accent} />
              <p className="mt-2 text-sm leading-relaxed opacity-85">{r.text}</p>
              <p className="mt-2 text-xs font-medium" style={{ color: ctx.colors.primary }}>
                — {r.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
