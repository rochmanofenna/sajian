// Onboarding layout. No tenant chrome — the whole (storefront) layout is
// for live restaurants. We show a minimal header with the Sajian wordmark.

import Link from 'next/link';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FDF6EC] text-[#1A1A18]">
      <header className="h-14 border-b border-[#1B5E3B]/10 flex items-center px-4">
        <Link href="/" className="font-semibold tracking-tight text-[#1B5E3B]">
          sajian
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}
