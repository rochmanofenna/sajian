'use client';

// Food-hall menu — dense 2-col grid with 1:1 thumbs. Sticky category nav.
// Optimized for scanning and fast ordering.

import { useMemo, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ORDER_TYPES, itemImage, itemPrice, type MenuVariantProps } from '../types';

export function FoodHallMenu({
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
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const jumpNav = useMemo(
    () =>
      sections.map((s) => ({
        key: s.key,
        label: s.subName,
      })),
    [sections],
  );

  return (
    <div className="tk-fh-menu" style={{ background }}>
      <div className="tk-fh-menu__sticky" style={{ background }}>
        <div className="tk-fh-menu__types">
          {ORDER_TYPES.map((t) => {
            const active = orderType === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setOrderType(t.value)}
                data-active={active}
                className="tk-fh-menu__type"
                style={
                  active
                    ? { background: primary, color: background }
                    : { background: `${primary}10`, color: primary }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {jumpNav.length > 0 && (
          <nav className="tk-fh-menu__tabs" aria-label="Kategori">
            {jumpNav.map((tab) => (
              <button
                key={tab.key}
                className="tk-fh-menu__tab"
                style={{ color: primary }}
                onClick={() =>
                  sectionRefs.current[tab.key]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {loading && (
        <div className="tk-fh-menu__state">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
        </div>
      )}
      {error && <div className="tk-fh-menu__error">{error}</div>}

      {!loading && !error && sections.map((s) => (
        <section
          key={s.key}
          className="tk-fh-menu__section"
          ref={(el) => {
            sectionRefs.current[s.key] = el;
          }}
        >
          <header className="tk-fh-menu__head">
            <h2 className="tk-fh-menu__title" style={{ color: primary }}>
              {s.subName}
            </h2>
            <span className="tk-fh-menu__count">{s.items.length}</span>
          </header>

          <div className="tk-fh-menu__grid">
            {s.items.map((item) => {
              const img = itemImage(item);
              const unavailable = item.flagSoldOut === true;
              return (
                <article
                  key={item.menuID}
                  className="tk-fh-menu__card"
                  data-unavailable={unavailable}
                >
                  <div
                    className="tk-fh-menu__thumb"
                    style={{
                      backgroundImage: img
                        ? `url(${img})`
                        : `linear-gradient(135deg, ${primary}18, ${accent}30)`,
                    }}
                  >
                    <button
                      onClick={() => onAdd(item)}
                      disabled={unavailable}
                      aria-label={`Tambah ${item.menuName}`}
                      className="tk-fh-menu__add"
                      style={{ background: primary, color: background }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="tk-fh-menu__card-body">
                    <div className="tk-fh-menu__name">{item.menuName}</div>
                    <div className="tk-fh-menu__price" style={{ color: primary }}>
                      {formatCurrency(itemPrice(item), tenant.currency_symbol, tenant.locale)}
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
