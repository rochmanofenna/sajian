// Onboarding layout. Editorial warm shell — no tenant chrome, no marketing
// nav clutter. Just the Sajian wordmark, a tiny progress marker, and a sign-
// out affordance. Keeps the owner focused on the chat + preview.

import Link from 'next/link';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ob-shell">
      <header className="ob-header">
        <Link href="/" className="ob-wordmark" aria-label="Sajian">
          Sajian<span className="ob-wordmark__dot">.</span>
        </Link>

        <div className="ob-header__meta">
          <span className="ob-header__dot" aria-hidden="true" />
          <span>Onboarding · sesi aktif</span>
        </div>
      </header>
      <main className="ob-main">{children}</main>
    </div>
  );
}
