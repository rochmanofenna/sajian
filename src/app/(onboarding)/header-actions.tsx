'use client';

// Right-aligned escape hatch in the onboarding header. "Keluar" signs the
// user out cleanly so an abandoned setup doesn't leave a stale session
// behind on a shared device.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function OnboardingHeaderActions() {
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    const host = window.location.host;
    if (host.includes('localhost')) {
      window.location.href = `http://localhost:${window.location.port || 3000}/`;
    } else {
      window.location.href = 'https://sajian.app/';
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className="ob-header__signout"
      aria-label="Keluar dari onboarding"
    >
      {loading ? 'Keluar…' : 'Keluar'}
    </button>
  );
}
