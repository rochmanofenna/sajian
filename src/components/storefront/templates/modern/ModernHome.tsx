'use client';

// Modern — clean, minimal, lots of whitespace. 16:9 rounded hero card with
// optional photo, small logo, light-weight name, generous spacing.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BranchPicker } from '../../BranchPicker';
import type { HomeVariantProps } from '../types';

export function ModernHome({ tenant }: HomeVariantProps) {
  const hero = tenant.hero_image_url;
  const primary = tenant.colors.primary;
  const accent = tenant.colors.accent;
  const background = tenant.colors.background;

  return (
    <main className="tk-modern" style={{ background }}>
      <section className="tk-modern__wrap">
        <div
          className="tk-modern__hero"
          style={{
            backgroundImage: hero
              ? `url(${hero})`
              : `linear-gradient(135deg, ${primary}22, ${accent}33), radial-gradient(circle at 20% 20%, ${accent}55, transparent 55%)`,
            backgroundColor: `${primary}10`,
          }}
        >
          <div className="tk-modern__hero-overlay" />
          <div className="tk-modern__hero-body">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt={tenant.name} className="tk-modern__logo" />
            ) : (
              <div className="tk-modern__logo-fallback" style={{ background: primary, color: background }}>
                {tenant.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="tk-modern__name">{tenant.name}</h1>
              {tenant.tagline && <p className="tk-modern__tagline">{tenant.tagline}</p>}
            </div>
          </div>
        </div>

        <div className="tk-modern__card">
          <div className="tk-modern__card-head">
            <div className="tk-modern__card-kicker">Mulai pesanan</div>
            <h2 className="tk-modern__card-title">Pilih cabang terdekat</h2>
          </div>
          <BranchPicker tenant={tenant} />

          <Link
            href="/menu"
            className="tk-modern__cta"
            style={{ background: primary, color: background }}
          >
            Lihat menu
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <footer className="tk-modern__foot">
          <span className="tk-modern__dot" style={{ background: accent }} />
          Dibuat dengan Sajian
        </footer>
      </section>
    </main>
  );
}
