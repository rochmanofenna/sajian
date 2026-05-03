// Full draft-menu rendering for the unlaunched-preview iframe.
//
// Why this exists: in preview mode (DraftStorefront), the FeaturedItems
// section renders only 4 highlight cards. Owners watching the iframe
// expect "Lihat Menu" to take them to a complete menu listing — that's
// the validation moment ("yes, all 114 items extracted correctly").
// We can't navigate to <slug>.sajian.app/menu because the unlaunched
// subdomain has no tenants row, but we CAN render the full menu inline
// at the bottom of the home page and anchor "Lihat Menu" to scroll to it.
//
// Renders every draft.menu_categories entry with every item — name,
// description, price. Image placeholders mirror FeaturedItems styling
// for visual consistency. After launch this component is never reached;
// /menu route's real path takes over.

import type { TenantDraft } from '@/lib/onboarding/types';
import type { SectionContext } from '@/lib/storefront/section-types';
import { formatCurrency } from '@/lib/utils';

export function DraftMenuPreview({
  draft,
  ctx,
}: {
  draft: TenantDraft;
  ctx: SectionContext;
}) {
  const cats = (draft.menu_categories ?? []).filter((c) => c.items.length > 0);
  if (cats.length === 0) return null;

  const totalItems = cats.reduce((n, c) => n + c.items.length, 0);

  return (
    <section
      id="sj-full-menu"
      className="px-6 py-16"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <div
            className="text-xs uppercase tracking-[0.18em] mb-2"
            style={{ color: ctx.colors.primary, opacity: 0.7 }}
          >
            Menu lengkap · {totalItems} item · {cats.length} kategori
          </div>
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ color: ctx.colors.primary, fontFamily: 'var(--font-display, serif)' }}
          >
            Semua Menu
          </h2>
        </header>

        {cats.map((cat) => (
          <div key={cat.name} className="mb-10">
            <h3
              className="text-lg font-semibold tracking-tight mb-4"
              style={{ color: ctx.colors.dark, fontFamily: 'var(--font-display, serif)' }}
            >
              {cat.name}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {cat.items.map((item, i) => (
                <article
                  key={`${cat.name}-${item.name}-${i}`}
                  className="flex gap-4 rounded-2xl p-3"
                  style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  <div
                    className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden"
                    style={{ background: `${ctx.colors.primary}10` }}
                  >
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium text-sm leading-tight"
                      style={{ color: ctx.colors.dark }}
                    >
                      {item.name}
                    </div>
                    {item.description ? (
                      <p className="text-xs opacity-70 mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    ) : null}
                    <div
                      className="text-sm font-semibold mt-2"
                      style={{ color: ctx.colors.primary }}
                    >
                      {formatCurrency(item.price, 'Rp ', 'id-ID')}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
