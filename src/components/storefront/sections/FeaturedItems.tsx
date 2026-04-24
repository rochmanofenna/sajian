// Featured items — spotlight menu items on the home page.
// Variants: horizontal, grid, spotlight.

import { formatCurrency } from '@/lib/utils';
import type { SectionComponentProps } from '@/lib/storefront/section-types';
import { SlotRenderer } from '@/components/storefront/SlotRenderer';

interface FeaturedProps {
  heading?: string;
  items?: string[]; // explicit item names to feature; else auto-pick
  limit?: number;
  // Phase 1 slot hook: primitive tree rendered after the items grid
  // (e.g. a "See all menu →" button styled differently, or a badge).
  trailing_slot?: unknown;
}

type Item = SectionComponentProps['ctx']['menuCategories'][number]['items'][number];

function pickItems(ctx: SectionComponentProps['ctx'], props: FeaturedProps): Item[] {
  const all = ctx.menuCategories.flatMap((c) => c.items);
  if (props.items?.length) {
    const lookup = new Set(props.items.map((n) => n.trim().toLowerCase()));
    const picked = all.filter((i) => lookup.has(i.name.trim().toLowerCase()));
    if (picked.length > 0) return picked;
  }
  return all.slice(0, props.limit ?? 4);
}

export function FeaturedItems({ section, ctx, props }: SectionComponentProps<FeaturedProps>) {
  const items = pickItems(ctx, props);
  if (items.length === 0) return null;

  const inner = (() => {
    if (section.variant === 'grid') return <Grid ctx={ctx} props={props} items={items} />;
    if (section.variant === 'spotlight') return <Spotlight ctx={ctx} props={props} items={items} />;
    return <Horizontal ctx={ctx} props={props} items={items} />;
  })();

  if (!props.trailing_slot) return inner;
  return (
    <>
      {inner}
      <div className="px-6 pb-8 -mt-4" style={{ background: ctx.colors.background }}>
        <div className="max-w-4xl mx-auto">
          <SlotRenderer tree={props.trailing_slot} />
        </div>
      </div>
    </>
  );
}

function Header({ ctx, props }: { ctx: SectionComponentProps['ctx']; props: FeaturedProps }) {
  return (
    <h2
      className="text-xl font-semibold tracking-tight mb-4"
      style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
    >
      {props.heading ?? 'Menu pilihan'}
    </h2>
  );
}

function ItemCard({ item, ctx }: { item: Item; ctx: SectionComponentProps['ctx'] }) {
  return (
    <div
      className="rounded-2xl bg-white overflow-hidden border"
      style={{ borderColor: `${ctx.colors.primary}18` }}
    >
      <div className="aspect-[4/3] w-full" style={{ background: `${ctx.colors.primary}10` }}>
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="p-3">
        <div className="font-medium text-sm leading-snug">{item.name}</div>
        <div
          className="mt-1 text-sm font-semibold"
          style={{ color: ctx.colors.primary }}
        >
          {formatCurrency(item.price, 'Rp ', 'id-ID')}
        </div>
      </div>
    </div>
  );
}

function Horizontal({
  ctx,
  props,
  items,
}: {
  ctx: SectionComponentProps['ctx'];
  props: FeaturedProps;
  items: Item[];
}) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 snap-x">
          {items.map((item) => (
            <div key={item.name} className="w-56 flex-shrink-0 snap-start">
              <ItemCard item={item} ctx={ctx} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Grid({
  ctx,
  props,
  items,
}: {
  ctx: SectionComponentProps['ctx'];
  props: FeaturedProps;
  items: Item[];
}) {
  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <Header ctx={ctx} props={props} />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {items.map((item) => (
            <ItemCard key={item.name} item={item} ctx={ctx} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Spotlight({
  ctx,
  props,
  items,
}: {
  ctx: SectionComponentProps['ctx'];
  props: FeaturedProps;
  items: Item[];
}) {
  const hero = items[0];
  const rest = items.slice(1, 4);
  return (
    <section
      className="px-6 py-12"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <Header ctx={ctx} props={props} />
        <div className="grid gap-6 md:grid-cols-5 items-stretch">
          <div className="md:col-span-3">
            <div
              className="aspect-[4/3] rounded-3xl overflow-hidden"
              style={{ background: `${ctx.colors.primary}14` }}
            >
              {hero.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero.image_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          </div>
          <div className="md:col-span-2 flex flex-col justify-center space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] opacity-60" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              Andalan
            </div>
            <h3
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-display, serif)' }}
            >
              {hero.name}
            </h3>
            {hero.description && <p className="text-sm opacity-75 leading-relaxed">{hero.description}</p>}
            <div
              className="text-xl font-semibold"
              style={{ color: ctx.colors.primary }}
            >
              {formatCurrency(hero.price, 'Rp ', 'id-ID')}
            </div>
            <a
              href="/menu"
              className="inline-block px-5 h-11 leading-[44px] rounded-full text-sm font-medium text-white self-start"
              style={{ background: ctx.colors.primary }}
            >
              Pesan {hero.name.split(' ').slice(0, 2).join(' ')}
            </a>
          </div>
        </div>
        {rest.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {rest.map((item) => (
              <ItemCard key={item.name} item={item} ctx={ctx} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
