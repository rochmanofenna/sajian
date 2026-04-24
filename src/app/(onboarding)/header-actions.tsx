'use client';

// Right-aligned escape hatch in the onboarding header. "Mulai dari awal"
// wipes the current draft so the owner can recover from a contaminated
// state (wrong menu extracted, leftovers from a failed launch). "Keluar"
// signs the user out cleanly so an abandoned setup doesn't leave a stale
// session behind on a shared device.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/lib/onboarding/store';

export function OnboardingHeaderActions() {
  const [loading, setLoading] = useState<null | 'signout' | 'reset'>(null);
  const resetDraft = useOnboarding((s) => s.resetDraft);

  async function signOut() {
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
    <div className="ob-header__actions">
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
  );
}
