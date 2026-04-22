'use client';

// Food-hall — scannable brand bar + direct category tabs, no tall hero. Built
// for customers who want to get to the menu in one tap.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BranchPicker } from '../../BranchPicker';
import type { HomeVariantProps } from '../types';

export function FoodHallHome({ tenant }: HomeVariantProps) {
  const primary = tenant.colors.primary;
  const accent = tenant.colors.accent;
  const background = tenant.colors.background;

  return (
    <main className="tk-fh" style={{ background }}>
      <section className="tk-fh__band" style={{ background: primary, color: background }}>
        {tenant.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logo_url} alt={tenant.name} className="tk-fh__logo" />
        )}
        <div className="tk-fh__meta">
          <div className="tk-fh__name">{tenant.name}</div>
          {tenant.tagline && <div className="tk-fh__tag">{tenant.tagline}</div>}
        </div>
        <div className="tk-fh__badge" style={{ background: accent, color: primary }}>
          Open now
        </div>
      </section>

      <section className="tk-fh__pick">
        <div className="tk-fh__eyebrow">Cabang</div>
        <BranchPicker tenant={tenant} />

        <Link
          href="/menu"
          className="tk-fh__cta"
          style={{ background: primary, color: background }}
        >
          <span>Order now</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="tk-fh__quick">
        <div className="tk-fh__quick-title">Cari cepat</div>
        <div className="tk-fh__chips">
          {['Makanan', 'Minuman', 'Dessert', 'Bestseller'].map((c) => (
            <Link
              key={c}
              href="/menu"
              className="tk-fh__chip"
              style={{ color: primary, borderColor: `${primary}30` }}
            >
              {c}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
