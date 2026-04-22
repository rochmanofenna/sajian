'use client';

// Universal storefront menu chrome: sticky category tab bar (with scroll-
// spy + scroll-to) and a floating cart bar at the bottom. Template variants
// stay responsible for the section/card visuals; this sits in parallel.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import type { MenuSection } from './templates/types';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';

interface Props {
  tenant: PublicTenant;
  sections: MenuSection[];
}

export function MenuOverlay({ tenant, sections }: Props) {
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getSubtotal());
  const count = items.reduce((n, i) => n + i.quantity, 0);

  const [active, setActive] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollingProgrammatic = useRef(false);

  const labels = useMemo(
    () => sections.map((s) => ({ key: s.key, label: s.categoryName || s.subName })),
    [sections],
  );

  // Scroll spy — highlight tab whose section is closest to the chrome.
  useEffect(() => {
    if (sections.length === 0) return;
    const nodes = sections
      .map((s) => document.getElementById(`cat-${s.key}`))
      .filter((n): n is HTMLElement => !!n);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingProgrammatic.current) return;
        // Prefer entries that are intersecting and closest to the top anchor.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).id;
          if (id.startsWith('cat-')) setActive(id.slice(4));
        }
      },
      {
        // Offset roughly the height of the sticky header + tabs
        rootMargin: '-120px 0px -60% 0px',
        threshold: [0, 0.25, 0.5, 1],
      },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [sections]);

  // Keep the active tab horizontally centered in the scroller.
  useEffect(() => {
    if (!active) return;
    const el = tabsRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${CSS.escape(active)}"]`,
    );
    if (el && tabsRef.current) {
      const container = tabsRef.current;
      const offset = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left: offset, behavior: 'smooth' });
    }
  }, [active]);

  function scrollTo(key: string) {
    const node = document.getElementById(`cat-${key}`);
    if (!node) return;
    scrollingProgrammatic.current = true;
    setActive(key);
    const top = node.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'smooth' });
    window.setTimeout(() => {
      scrollingProgrammatic.current = false;
    }, 700);
  }

  if (sections.length === 0) return null;

  return (
    <>
      {labels.length > 1 && (
        <div className="mo-tabs" role="tablist" aria-label="Kategori menu">
          <div ref={tabsRef} className="mo-tabs__scroll">
            {labels.map((l) => {
              const isActive = active === l.key;
              return (
                <button
                  key={l.key}
                  data-tab={l.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-active={isActive || undefined}
                  onClick={() => scrollTo(l.key)}
                  className="mo-tabs__tab"
                  style={isActive ? { background: tenant.colors.primary, color: '#fff', borderColor: tenant.colors.primary } : undefined}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="mo-cartbar" role="status" aria-live="polite">
          <Link
            href="/cart"
            className="mo-cartbar__link"
            style={{ background: tenant.colors.primary }}
          >
            <span className="mo-cartbar__left">
              <span className="mo-cartbar__icon">
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="mo-cartbar__count">{count}</span>
              <span className="mo-cartbar__sep" aria-hidden="true">·</span>
              <span className="mo-cartbar__amt">
                {formatCurrency(subtotal, tenant.currency_symbol, tenant.locale)}
              </span>
            </span>
            <span className="mo-cartbar__cta">
              Lihat keranjang
              <span aria-hidden="true" className="mo-cartbar__arrow">→</span>
            </span>
          </Link>
        </div>
      )}
    </>
  );
}
