'use client';

// Kedai menu — single column, large photo left, editorial typography right.
// Category headings are italic serif with a thin ochre rule.

import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ORDER_TYPES, itemImage, itemPrice, type MenuVariantProps } from '../types';

export function KedaiMenu({
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

  return (
    <div className="tk-kedai-menu">
      <div className="tk-kedai-menu__types">
        {ORDER_TYPES.map((t) => {
          const active = orderType === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              className="tk-kedai-menu__type"
              data-active={active}
              style={
                active
                  ? { background: primary, color: '#fff', borderColor: primary }
                  : { color: primary, borderColor: `${primary}30` }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="tk-kedai-menu__state">
          <Loader2 className="h-4 w-4 animate-spin" /> Menu sedang disiapkan…
        </div>
      )}
      {error && <div className="tk-kedai-menu__error">{error}</div>}

      {!loading && !error && sections.length === 0 && (
        <div className="tk-kedai-menu__state">Menu kosong untuk cabang ini.</div>
      )}

      {!loading && !error && sections.length > 0 && (
        <div className="tk-kedai-menu__body">
          {sections.map((s) => (
            <section key={s.key} className="tk-kedai-menu__section">
              <header className="tk-kedai-menu__head">
                <div className="tk-kedai-menu__kicker">{s.categoryName}</div>
                <h2 className="tk-kedai-menu__title" style={{ color: primary }}>
                  {s.subName}
                </h2>
                <div className="tk-kedai-menu__rule" style={{ background: accent }} />
              </header>

              <div className="tk-kedai-menu__rows">
                {s.items.map((item) => {
                  const unavailable = item.flagSoldOut === true;
                  const img = itemImage(item);
                  return (
                    <article key={item.menuID} className="tk-kedai-menu__row">
                      <div
                        className="tk-kedai-menu__thumb"
                        style={{
                          backgroundImage: img
                            ? `url(${img})`
                            : `linear-gradient(135deg, ${primary}22, ${accent}33)`,
                        }}
                      />
                      <div className="tk-kedai-menu__text">
                        <div className="tk-kedai-menu__name">{item.menuName}</div>
                        {item.description && (
                          <p className="tk-kedai-menu__desc">{item.description}</p>
                        )}
                        <div className="tk-kedai-menu__price" style={{ color: primary }}>
                          {formatCurrency(itemPrice(item), tenant.currency_symbol, tenant.locale)}
                          {unavailable && <span className="tk-kedai-menu__sold">sold out</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => onAdd(item)}
                        disabled={unavailable}
                        className="tk-kedai-menu__add"
                        aria-label={`Tambah ${item.menuName}`}
                        style={{ background: primary, color: '#fff' }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
