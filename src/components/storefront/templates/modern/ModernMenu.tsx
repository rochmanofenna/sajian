'use client';

// Modern menu — 2-col card grid (1-col mobile), 4:3 photos, subtle shadow.
// Category section titles are light, generous spacing.

import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ORDER_TYPES, itemImage, itemPrice, type MenuVariantProps } from '../types';

export function ModernMenu({
  tenant,
  sections,
  loading,
  error,
  orderType,
  setOrderType,
  onAdd,
}: MenuVariantProps) {
  const primary = tenant.colors.primary;
  const background = tenant.colors.background;
  const accent = tenant.colors.accent;

  return (
    <div className="tk-modern-menu" style={{ background }}>
      <div className="tk-modern-menu__types">
        {ORDER_TYPES.map((t) => {
          const active = orderType === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              data-active={active}
              className="tk-modern-menu__type"
              style={
                active
                  ? { background: primary, color: background }
                  : { color: primary, background: `${primary}0D` }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="tk-modern-menu__state">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading menu…
        </div>
      )}
      {error && <div className="tk-modern-menu__error">{error}</div>}

      {!loading && !error && sections.map((s) => (
        <section key={s.key} id={`cat-${s.key}`} className="tk-modern-menu__section">
          <header className="tk-modern-menu__head">
            <div className="tk-modern-menu__kicker">{s.categoryName}</div>
            <h2 className="tk-modern-menu__title">{s.subName}</h2>
          </header>

          <div className="tk-modern-menu__grid">
            {s.items.map((item) => {
              const img = itemImage(item);
              const unavailable = item.flagSoldOut === true;
              return (
                <article key={item.menuID} className="tk-modern-menu__card">
                  <div
                    className="tk-modern-menu__photo"
                    style={{
                      backgroundImage: img
                        ? `url(${img})`
                        : `linear-gradient(135deg, ${primary}20, ${accent}35)`,
                    }}
                  />
                  <div className="tk-modern-menu__card-body">
                    <div className="tk-modern-menu__card-name">{item.menuName}</div>
                    {item.description && (
                      <p className="tk-modern-menu__card-desc">{item.description}</p>
                    )}
                    <div className="tk-modern-menu__card-foot">
                      <div className="tk-modern-menu__card-price">
                        {formatCurrency(itemPrice(item), tenant.currency_symbol, tenant.locale)}
                        {unavailable && <span className="tk-modern-menu__card-sold"> · sold out</span>}
                      </div>
                      <button
                        onClick={() => onAdd(item)}
                        disabled={unavailable}
                        className="tk-modern-menu__card-add"
                        aria-label={`Add ${item.menuName}`}
                        style={{ background: primary, color: background }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
