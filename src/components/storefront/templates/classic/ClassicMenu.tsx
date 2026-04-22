'use client';

// Classic menu — two-column layout with dotted leaders between name and
// price. No item photos; drop caps on the first letter of each category.
// Pure serif typography.

import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ORDER_TYPES, itemPrice, type MenuVariantProps } from '../types';

export function ClassicMenu({
  tenant,
  sections,
  loading,
  error,
  orderType,
  setOrderType,
  onAdd,
}: MenuVariantProps) {
  const primary = tenant.colors.primary;
  const accent = tenant.colors.accent;
  const background = tenant.colors.background;

  return (
    <div className="tk-classic-menu" style={{ background }}>
      <div className="tk-classic-menu__types">
        {ORDER_TYPES.map((t) => {
          const active = orderType === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              data-active={active}
              className="tk-classic-menu__type"
              style={
                active
                  ? { color: background, background: primary }
                  : { color: primary }
              }
            >
              <em>{t.label}</em>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="tk-classic-menu__state">
          <Loader2 className="h-4 w-4 animate-spin" /> <em>Prepared with care…</em>
        </div>
      )}
      {error && <div className="tk-classic-menu__error">{error}</div>}

      {!loading && !error && sections.map((s) => (
        <section key={s.key} className="tk-classic-menu__section">
          <header className="tk-classic-menu__head">
            <div className="tk-classic-menu__divider" style={{ borderColor: primary }} />
            <h2 className="tk-classic-menu__title" style={{ color: primary }}>
              <span className="tk-classic-menu__drop" style={{ color: accent }}>
                {s.subName.charAt(0)}
              </span>
              {s.subName.slice(1)}
            </h2>
            <div className="tk-classic-menu__kicker" style={{ color: primary }}>
              — {s.categoryName} —
            </div>
          </header>

          <ol className="tk-classic-menu__list">
            {s.items.map((item) => {
              const unavailable = item.flagSoldOut === true;
              return (
                <li key={item.menuID} className="tk-classic-menu__row">
                  <div className="tk-classic-menu__row-head">
                    <div className="tk-classic-menu__row-name" style={{ color: primary }}>
                      {item.menuName}
                    </div>
                    <div className="tk-classic-menu__row-dots" aria-hidden="true" />
                    <div className="tk-classic-menu__row-price" style={{ color: primary }}>
                      {formatCurrency(itemPrice(item), tenant.currency_symbol, tenant.locale)}
                    </div>
                  </div>
                  {item.description && (
                    <p className="tk-classic-menu__row-desc">
                      <em>{item.description}</em>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => onAdd(item)}
                    disabled={unavailable}
                    className="tk-classic-menu__row-add"
                    style={{ color: primary }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {unavailable ? <em>indisponible</em> : <em>ajouter</em>}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
