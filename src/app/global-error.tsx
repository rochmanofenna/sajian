'use client';

// Last-resort boundary — catches errors in the root layout itself (which
// src/app/error.tsx cannot recover from because it lives inside the same
// layout tree). Must render its own <html> + <body>.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/global-error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack?.split('\n').slice(0, 4).join('\n'),
    });
  }, [error]);

  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <main
          style={{
            minHeight: '100svh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: '#ffffff',
            color: '#0A0B0A',
          }}
        >
          <div style={{ maxWidth: 400, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              Sajian sedang pulih.
            </h1>
            <p style={{ fontSize: 14, color: '#555', marginBottom: 16 }}>
              Halaman tidak bisa dimuat. Coba lagi beberapa saat.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                height: 40,
                padding: '0 20px',
                borderRadius: 999,
                background: '#0A0B0A',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                border: 0,
                cursor: 'pointer',
              }}
            >
              Muat ulang
            </button>
            {error.digest && (
              <p style={{ fontSize: 11, color: '#999', marginTop: 16, fontFamily: 'monospace' }}>
                ref: {error.digest}
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
