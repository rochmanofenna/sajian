'use client';

// Warung — bold street-food energy. Giant chunky name over a colored block
// with a diagonal stripe pattern, minimal chrome, high-contrast CTA.

import Link from 'next/link';
import { BranchPicker } from '../../BranchPicker';
import type { HomeVariantProps } from '../types';

export function WarungHome({ tenant }: HomeVariantProps) {
  const primary = tenant.colors.primary;
  const accent = tenant.colors.accent;
  const background = tenant.colors.background;

  return (
    <main className="tk-warung">
      <section
        className="tk-warung__stage"
        style={{
          background: `repeating-linear-gradient(135deg, ${primary} 0 80px, ${primary}E6 80px 160px)`,
        }}
      >
        <div className="tk-warung__slab" style={{ background: accent }}>
          <div className="tk-warung__kicker">Rumah makan · Indonesia</div>
          <h1 className="tk-warung__name" style={{ color: primary }}>
            {tenant.name}
          </h1>
          {tenant.tagline && (
            <p className="tk-warung__tagline" style={{ color: `${primary}CC` }}>
              {tenant.tagline}
            </p>
          )}
          <div className="tk-warung__tags">
            <span>Pesan dari HP</span>
            <span>Langsung ke dapur</span>
            <span>Bayar cepat</span>
          </div>
        </div>
      </section>

      <section className="tk-warung__panel" style={{ background }}>
        <div className="tk-warung__panel-head">
          <div className="tk-warung__panel-num">01</div>
          <h2 className="tk-warung__panel-title" style={{ color: primary }}>
            Pilih cabang
          </h2>
        </div>
        <BranchPicker tenant={tenant} />

        <Link
          href="/menu"
          className="tk-warung__cta"
          style={{ background: primary, color: background }}
        >
          Lihat Menu
          <span className="tk-warung__cta-arrow" aria-hidden="true">→</span>
        </Link>

        <div className="tk-warung__strip" aria-hidden="true" style={{ background: accent }} />
      </section>
    </main>
  );
}
