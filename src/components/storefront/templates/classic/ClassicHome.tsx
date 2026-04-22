'use client';

// Classic — traditional menu aesthetic. Ornate title block with double rules,
// serif everything, cream paper background. Looks like a brasserie's printed
// carte digitized.

import Link from 'next/link';
import { BranchPicker } from '../../BranchPicker';
import type { HomeVariantProps } from '../types';

export function ClassicHome({ tenant }: HomeVariantProps) {
  const primary = tenant.colors.primary;
  const accent = tenant.colors.accent;
  const background = tenant.colors.background;

  return (
    <main className="tk-classic" style={{ background }}>
      <section className="tk-classic__title">
        <div className="tk-classic__rule tk-classic__rule--double" style={{ borderColor: primary }} />
        <div className="tk-classic__eyebrow" style={{ color: primary }}>
          Établi · Indonesia
        </div>
        <h1 className="tk-classic__name" style={{ color: primary }}>
          {tenant.name}
        </h1>
        <div className="tk-classic__ornament" style={{ color: accent }}>
          <span>❦</span>
          <span className="tk-classic__ornament-rule" style={{ background: primary }} />
          <span>❦</span>
        </div>
        {tenant.tagline && (
          <p className="tk-classic__tagline" style={{ color: primary }}>
            <em>{tenant.tagline}</em>
          </p>
        )}
        <div className="tk-classic__rule tk-classic__rule--double" style={{ borderColor: primary }} />
      </section>

      <section className="tk-classic__panel">
        <div className="tk-classic__panel-title" style={{ color: primary }}>
          La Carte — choisissez votre succursale
        </div>
        <BranchPicker tenant={tenant} />

        <Link
          href="/menu"
          className="tk-classic__cta"
          style={{ background: primary, color: background }}
        >
          Ouvrir le menu
        </Link>

        <div className="tk-classic__foot">
          <em>Merci · Terima kasih</em>
        </div>
      </section>
    </main>
  );
}
