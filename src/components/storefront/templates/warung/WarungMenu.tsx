'use client';

// Warung menu — bold rows. Item name huge, price bigger, no description unless
// the user taps. Category headings are full-width colored bars.

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ORDER_TYPES, itemImage, itemPrice, type MenuVariantProps } from '../types';
import type { ESBMenuItem } from '@/lib/esb/types';

export function WarungMenu({
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
    <div className="tk-warung-menu" style={{ background }}>
      <div className="tk-warung-menu__types">
        {ORDER_TYPES.map((t) => {
          const active = orderType === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              className="tk-warung-menu__type"
              data-active={active}
              style={
                active
                  ? { background: primary, color: background, borderColor: primary }
                  : { background: background, color: primary, borderColor: `${primary}40` }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="tk-warung-menu__state">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat menu…
        </div>
      )}
      {error && <div className="tk-warung-menu__error">{error}</div>}

      {!loading && !error && sections.map((s) => (
        <section key={s.key} className="tk-warung-menu__section">
          <header
            className="tk-warung-menu__bar"
            style={{ background: primary, color: background }}
          >
            <span className="tk-warung-menu__bar-kick">{s.categoryName}</span>
            <h2 className="tk-warung-menu__bar-title">{s.subName}</h2>
          </header>

          <div className="tk-warung-menu__list">
            {s.items.map((item) => (
              <WarungRow
                key={item.menuID}
                item={item}
                primary={primary}
                accent={accent}
                background={background}
                currency={tenant.currency_symbol}
                locale={tenant.locale}
                onAdd={() => onAdd(item)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function WarungRow({
  item,
  primary,
  accent,
  background,
  currency,
  locale,
  onAdd,
}: {
  item: ESBMenuItem;
  primary: string;
  accent: string;
  background: string;
  currency: string;
  locale: string;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unavailable = item.flagSoldOut === true;
  const img = itemImage(item);
  return (
    <article className="tk-warung-menu__row" data-open={open}>
      <button
        type="button"
        className="tk-warung-menu__row-main"
        onClick={() => item.description && setOpen((v) => !v)}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="tk-warung-menu__row-img" />
        ) : (
          <div className="tk-warung-menu__row-img" style={{ background: `${accent}50` }} />
        )}
        <div className="tk-warung-menu__row-body">
          <div className="tk-warung-menu__row-name" style={{ color: primary }}>
            {item.menuName}
          </div>
          <div className="tk-warung-menu__row-price" style={{ color: primary }}>
            {formatCurrency(itemPrice(item), currency, locale)}
            {unavailable && <span className="tk-warung-menu__row-sold">habis</span>}
          </div>
        </div>
      </button>
      {open && item.description && (
        <p className="tk-warung-menu__row-desc">{item.description}</p>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={unavailable}
        aria-label={`Tambah ${item.menuName}`}
        className="tk-warung-menu__row-add"
        style={{ background: accent, color: primary }}
      >
        <Plus className="h-5 w-5" />
      </button>
    </article>
  );
}
