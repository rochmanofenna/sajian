'use client';

// Opt-in toggle for the codegen "Mode lanjutan" feature. Renders an
// off-by-default card that the owner can activate from Store settings.
// Separate from the core owner flow so it stays quiet until explicitly
// opted into — per the Phase 4 spec.

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';

interface FlagShape {
  codegen_enabled: boolean;
  codegen_enabled_for_tenant: boolean;
  codegen_enabled_at: string | null;
  codegen_enabled_by: string | null;
  codegen_globally_enabled: boolean;
}

export function AdvancedModeToggle() {
  const [flag, setFlag] = useState<FlagShape | null>(null);
  const [busy, setBusy] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/feature-flags/me', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal memuat');
      setFlag(body as FlagShape);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(enable: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/feature-flags/self-enable-codegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal');
      await load();
      if (enable) setJustEnabled(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const on = flag?.codegen_enabled_for_tenant === true;
  const globallyOff = flag?.codegen_globally_enabled === false;

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold">Mode lanjutan</h3>
      </header>
      <p className="text-sm text-zinc-600">
        AI bisa bikin layout custom pake kode. Cocok buat yang mau kreatif. Kalau ada error, kamu bisa rollback dari riwayat versi.
      </p>

      {flag === null && !error && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Memuat status…
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {flag !== null && (
        <>
          {globallyOff && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Mode lanjutan sementara dimatikan di seluruh sistem.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggle(!on)}
              disabled={busy || (globallyOff && !on)}
              className={`h-10 px-4 rounded-full text-sm font-medium disabled:opacity-50 ${
                on
                  ? 'border border-zinc-300 bg-white text-zinc-900'
                  : 'bg-zinc-900 text-white'
              }`}
            >
              {busy
                ? 'Memproses…'
                : on
                  ? 'Matikan mode lanjutan'
                  : 'Aktifkan mode lanjutan'}
            </button>
            {on && !busy && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Check className="h-3 w-3" /> Aktif
              </span>
            )}
          </div>
          {on && justEnabled && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-3 py-2">
              AI sekarang bisa bikin section custom. Coba minta &ldquo;tambahkan tombol floating di pojok kanan&rdquo;.
            </div>
          )}
        </>
      )}
    </section>
  );
}
