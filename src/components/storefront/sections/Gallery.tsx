// Gallery — shows menu item photos (or explicit `photos` prop) in a grid,
// carousel, or 1-large-4-thumbnails featured layout.

import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface GalleryProps {
  heading?: string;
  photos?: string[];
  limit?: number;
}

function pickPhotos(ctx: SectionComponentProps['ctx'], props: GalleryProps): string[] {
  if (props.photos?.length) return props.photos;
  const fromItems = ctx.menuCategories
    .flatMap((c) => c.items)
    .map((i) => i.image_url)
    .filter((u): u is string => Boolean(u));
  return fromItems.slice(0, props.limit ?? 6);
}

export function Gallery({ section, ctx, props }: SectionComponentProps<GalleryProps>) {
  const photos = pickPhotos(ctx, props);
  if (photos.length === 0) return null;

  if (section.variant === 'carousel') return <Carousel ctx={ctx} props={props} photos={photos} />;
  if (section.variant === 'featured') return <Featured ctx={ctx} props={props} photos={photos} />;
  return <Grid ctx={ctx} props={props} photos={photos} />;
}

function Header({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: GalleryProps }) {
  return (
    <h2
      className="text-xl font-semibold tracking-tight mb-4"
      style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
    >
      {props.heading ?? 'Galeri'}
    </h2>
  );
}

function Grid({
  ctx,
  props,
  photos,
}: {
  ctx: SectionComponentProps['ctx'];
  props: GalleryProps;
  photos: string[];
}) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="aspect-square rounded-xl overflow-hidden"
              style={{ background: `${ctx.colors.primary}10` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Carousel({
  ctx,
  props,
  photos,
}: {
  ctx: SectionComponentProps['ctx'];
  props: GalleryProps;
  photos: string[];
}) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 snap-x">
          {photos.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="w-56 h-56 flex-shrink-0 snap-start rounded-2xl overflow-hidden"
              style={{ background: `${ctx.colors.primary}10` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Featured({
  ctx,
  props,
  photos,
}: {
  ctx: SectionComponentProps['ctx'];
  props: GalleryProps;
  photos: string[];
}) {
  const [hero, ...rest] = photos;
  const thumbs = rest.slice(0, 4);
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="grid gap-3 md:grid-cols-3">
          <div
            className="md:col-span-2 aspect-[4/3] md:aspect-auto rounded-3xl overflow-hidden"
            style={{ background: `${ctx.colors.primary}10`, minHeight: 240 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {thumbs.map((src, i) => (
              <div
                key={`${src}-${i}`}
                className="aspect-square rounded-2xl overflow-hidden"
                style={{ background: `${ctx.colors.primary}10` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
