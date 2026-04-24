'use client';

// Storefront route-level boundary. Catches crashes in /menu, /cart,
// /checkout, /track/[id]. Layout stays mounted (tenant header + footer),
// only the inner content is replaced so the customer keeps their tenant
// context.

import { useEffect } from 'react';

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[storefront/error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack?.split('\n').slice(0, 4).join('\n'),
    });
  }, [error]);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Toko sedang dimuat ulang…
        </h1>
        <p className="text-sm opacity-70">
          Kami lagi benerin halaman ini. Menu dan pesanan kamu nggak hilang.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-block px-5 h-10 leading-[40px] rounded-full bg-zinc-900 text-white text-sm font-medium"
        >
          Coba lagi
        </button>
        {error.digest && (
          <p className="text-[11px] font-mono opacity-50">ref: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
