'use client';

// App-shell error boundary — catches crashes in the root layout tree that
// aren't covered by a more specific segment boundary. Renders a minimal
// neutral fallback since we don't have tenant brand colors here yet.

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack?.split('\n').slice(0, 4).join('\n'),
    });
  }, [error]);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24 bg-white">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Ada kendala sebentar.
        </h1>
        <p className="text-sm text-zinc-600">
          Halaman gagal dimuat. Coba lagi dalam beberapa detik.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-block px-5 h-10 leading-[40px] rounded-full bg-zinc-900 text-white text-sm font-medium"
        >
          Muat ulang
        </button>
        {error.digest && (
          <p className="text-[11px] font-mono text-zinc-400">ref: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
