// Featured items — spotlight 3-6 menu items on the home page.
// Pulls from ctx.menuCategories; the props can optionally override the
// explicit list via `items` (array of item names to include).

import { formatCurrency } from '@/lib/utils';
import type { SectionComponentProps } from '@/lib/storefront/section-types';

interface FeaturedProps {
  heading?: string;
  items?: string[]; // names to feature; else auto-pick
  limit?: number;
}

function pickItems(ctx: SectionComponentProps['ctx'], props: FeaturedProps) {
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

  if (section.variant === 'grid') return <Grid ctx={ctx} props={props} items={items} />;
  return <Horizontal ctx={ctx} props={props} items={items} />;
}

type Item = SectionComponentProps['ctx']['menuCategories'][number]['items'][number];

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
