'use client';

// Gallery — shows menu item photos (or explicit `photos` prop) in a grid,
// carousel, or 1-large-4-thumbnails featured layout. The grid variant
// doubles as a lightbox — clicking a thumbnail opens a full-screen
// zoomed view; ESC or clicking the backdrop closes it.
//
// Vertical rhythm follows the scale defined in
// docs/codegen-audit-2026-04-27.md (Layer 1.3): py-16 default.

import { useEffect, useState } from 'react';
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

// Maps a raw photo count to a clean grid layout. Pre-fix the Grid
// variant always rendered grid-cols-3 regardless of count, producing
// awkward 3+1 / 3+2 / 3+3+1 orphan rows (Fauzan's Sandwicherie
// preview hit the 3+1 case with 4 photos). The map below trims to
// the nearest count that produces a clean rectangular grid and picks
// the column count to match. Mobile keeps a smaller column count so
// thumbs aren't tiny.
//
// Trim semantics: a count of 5 trims to 4, 7 trims to 6, 10/11 trim
// to 9, 13+ trims to 12. We never pad with placeholder photos —
// silent trim is preferable to filler.
export function galleryGridLayout(rawCount: number): {
  cleanCount: number;
  mobileCols: string;
  desktopCols: string;
} {
  if (rawCount <= 0) return { cleanCount: 0, mobileCols: 'grid-cols-1', desktopCols: 'md:grid-cols-1' };
  if (rawCount === 1) return { cleanCount: 1, mobileCols: 'grid-cols-1', desktopCols: 'md:grid-cols-1' };
  if (rawCount === 2) return { cleanCount: 2, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-2' };
  if (rawCount === 3) return { cleanCount: 3, mobileCols: 'grid-cols-1', desktopCols: 'md:grid-cols-3' };
  if (rawCount === 4) return { cleanCount: 4, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-2' };
  if (rawCount === 5) return { cleanCount: 4, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-2' };
  if (rawCount === 6) return { cleanCount: 6, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-3' };
  if (rawCount === 7) return { cleanCount: 6, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-3' };
  if (rawCount === 8) return { cleanCount: 8, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-4' };
  if (rawCount === 9) return { cleanCount: 9, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-3' };
  if (rawCount < 12) return { cleanCount: 9, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-3' };
  return { cleanCount: 12, mobileCols: 'grid-cols-2', desktopCols: 'md:grid-cols-4' };
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
  // Trim to a clean rectangular grid count (see galleryGridLayout).
  const { cleanCount, mobileCols, desktopCols } = galleryGridLayout(photos.length);
  const trimmed = cleanCount === 0 ? [] : photos.slice(0, cleanCount);

  // Lightbox: clicking a thumb opens a full-screen zoom; ESC / backdrop
  // / the X close it. Keyboard arrow keys step through siblings. All
  // state is local — no layout shift on the page when open.
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? null : (i + 1) % trimmed.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? null : (i - 1 + trimmed.length) % trimmed.length));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, trimmed.length]);

  return (
    <section
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className={`grid ${mobileCols} ${desktopCols} gap-2`}>
          {trimmed.map((src, i) => (
            <button
              type="button"
              key={`${src}-${i}`}
              onClick={() => setOpen(i)}
              aria-label={`Perbesar foto ${i + 1}`}
              className="aspect-square rounded-xl overflow-hidden focus:outline-none focus:ring-2"
              style={{ background: `${ctx.colors.primary}10`, border: 0, padding: 0, cursor: 'zoom-in' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
      {open !== null && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(null); }}
            aria-label="Tutup"
            className="absolute top-4 right-6 text-white text-3xl"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={trimmed[open]}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
      className="px-6 py-16"
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
      className="px-6 py-16"
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
