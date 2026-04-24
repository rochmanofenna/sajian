// Gallery — shows menu item photos (or explicit `photos` prop) in a grid
// or horizontal scroll.

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
  return <Grid ctx={ctx} props={props} photos={photos} />;
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
        <h2
          className="text-xl font-semibold tracking-tight mb-4"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Galeri'}
        </h2>
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
        <h2
          className="text-xl font-semibold tracking-tight mb-4"
          style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
        >
          {props.heading ?? 'Galeri'}
        </h2>
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
