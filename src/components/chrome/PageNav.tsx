'use client';

// Editorial navigation chrome for every non-admin page. Back chevron on the
// left (smart default: browser back with a href fallback), uppercase mono
// label in the center, optional ornament on the right. Small, tall enough
// for a comfortable tap target (44px), and mobile-first.
//
// Intentionally *not* a header — pages can have their own hero beneath.
// This is a single editorial strip that sits above whatever the page does.

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export interface PageNavProps {
  label: string;
  /** href fallback if there's no history (direct load / fresh tab). */
  backHref?: string;
  /** Override the back chevron entirely (e.g., for a close X). */
  leading?: ReactNode;
  /** Right-side ornament or action (e.g., cart chip, share). */
  trailing?: ReactNode;
  /** Optional one-line caption under the label. Stays short. */
  caption?: string;
}

export function PageNav({
  label,
  backHref = '/',
  leading,
  trailing,
  caption,
}: PageNavProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  }

  return (
    <nav className="pn">
      <div className="pn__side pn__side--left">
        {leading ?? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Kembali"
            className="pn__back"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="pn__back-text">Kembali</span>
          </button>
        )}
      </div>

      <div className="pn__center">
        <span className="pn__label">{label}</span>
        {caption && <span className="pn__caption">{caption}</span>}
      </div>

      <div className="pn__side pn__side--right">{trailing}</div>
    </nav>
  );
}
