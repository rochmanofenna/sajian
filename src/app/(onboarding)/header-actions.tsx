'use client';

// Right-aligned escape hatch in the onboarding header. "Mulai dari awal"
// wipes the current draft so the owner can recover from a contaminated
// state (wrong menu extracted, leftovers from a failed launch). "Keluar"
// signs the user out cleanly so an abandoned setup doesn't leave a stale
// session behind on a shared device.
//
// Mobile (< 640px): both actions collapse into a kebab dropdown so
// "MULAI DARI AWAL" doesn't wrap to three lines + push the layout
// past the viewport. Desktop (>= 640px): two pill buttons inline as
// before. CSS-driven via .ob-header__actions--inline /
// .ob-header__actions--menu so SSR markup is identical and there's
// no flash on hydration.

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/lib/onboarding/store';

export function OnboardingHeaderActions() {
  const [loading, setLoading] = useState<null | 'signout' | 'reset'>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const resetDraft = useOnboarding((s) => s.resetDraft);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click + ESC. Tap targets stay
  // ≥44px (button height = 44 set in CSS) so the menu items meet
  // mobile a11y guidance.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function signOut() {
    setMenuOpen(false);
    setLoading('signout');
    const supabase = createClient();
    await supabase.auth.signOut();
    const host = window.location.host;
    if (host.includes('localhost')) {
      window.location.href = `http://localhost:${window.location.port || 3000}/`;
    } else {
      window.location.href = 'https://sajian.app/';
    }
  }

  async function reset() {
    setMenuOpen(false);
    if (
      !window.confirm(
        'Hapus draft dan mulai dari awal? Menu, foto, dan warna yang belum di-launch akan hilang.',
      )
    )
      return;
    setLoading('reset');
    await resetDraft();
    setLoading(null);
  }

  return (
    <div className="ob-header__actions" ref={menuRef}>
      {/* Inline pills — visible at >= 640px via CSS */}
      <div className="ob-header__actions-inline">
        <button
          type="button"
          onClick={reset}
          disabled={loading !== null}
          className="ob-header__signout"
          aria-label="Reset onboarding"
        >
          {loading === 'reset' ? 'Reset…' : 'Mulai dari awal'}
        </button>
        <button
          type="button"
          onClick={signOut}
          disabled={loading !== null}
          className="ob-header__signout"
          aria-label="Keluar dari onboarding"
        >
          {loading === 'signout' ? 'Keluar…' : 'Keluar'}
        </button>
      </div>

      {/* Kebab + dropdown — visible at < 640px via CSS */}
      <div className="ob-header__actions-menu">
        <button
          type="button"
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          disabled={loading !== null}
          className="ob-header__kebab"
        >
          <span aria-hidden="true">⋯</span>
        </button>
        {menuOpen && (
          <div className="ob-header__menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={reset}
              disabled={loading !== null}
              className="ob-header__menu-item"
            >
              {loading === 'reset' ? 'Reset…' : 'Mulai dari awal'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={loading !== null}
              className="ob-header__menu-item"
            >
              {loading === 'signout' ? 'Keluar…' : 'Keluar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
