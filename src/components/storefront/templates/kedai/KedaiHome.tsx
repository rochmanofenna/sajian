'use client';

// Kedai — warm editorial coffee-shop aesthetic. Full-bleed cover photo with
// a vignette, logo + name centered over it, operating-hours badge. If the
// tenant has no hero_image_url we render a subtle gradient in the brand
// colours so the layout still reads.

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { BranchPicker } from '../../BranchPicker';
import type { HomeVariantProps } from '../types';

export function KedaiHome({ tenant }: HomeVariantProps) {
  const hero = tenant.hero_image_url;
  const primary = tenant.colors.primary;
  const accent = tenant.colors.accent;
  const background = tenant.colors.background;

  return (
    <main className="tk-kedai">
      <section className="tk-kedai__stage">
        <div
          className="tk-kedai__cover"
          style={{
            backgroundImage: hero
              ? `linear-gradient(180deg, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.65) 100%), url(${hero})`
              : `radial-gradient(circle at 30% 20%, ${accent}40, transparent 55%), linear-gradient(160deg, ${primary} 0%, #0a0b0a 120%)`,
          }}
        />

        <div className="tk-kedai__hero">
          <div className="tk-kedai__rule" aria-hidden="true" />
          <div className="tk-kedai__eyebrow">
            Est. · Coffee &amp; kitchen
          </div>
          {tenant.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="tk-kedai__logo" />
          )}
          <h1 className="tk-kedai__name">{tenant.name}</h1>
          {tenant.tagline && <p className="tk-kedai__tagline">{tenant.tagline}</p>}
          <div className="tk-kedai__rule tk-kedai__rule--short" aria-hidden="true" />
        </div>
      </section>

      <section className="tk-kedai__panel">
        <div className="tk-kedai__panel-grid">
          <div>
            <div className="tk-kedai__panel-eyebrow">Today</div>
            <h2 className="tk-kedai__panel-title">Choose your branch.</h2>
            <p className="tk-kedai__panel-body">
              We&rsquo;ll pick the closest shop so the menu shows what&rsquo;s brewing right now.
            </p>
          </div>
          <div>
            <BranchPicker tenant={tenant} />
          </div>
        </div>

        <Link
          href="/menu"
          className="tk-kedai__cta"
          style={{ background: primary, color: background }}
        >
          See the menu
          <span aria-hidden="true">→</span>
        </Link>

        <div className="tk-kedai__foot">
          <span className="tk-kedai__pin" aria-hidden="true"><MapPin className="h-3.5 w-3.5" /></span>
          <span>{tenant.name} · Indonesia</span>
        </div>
      </section>
    </main>
  );
}
