'use client';

// Shown to the verified owner of a deactivated tenant. The storefront shows
// a customer-facing "offline" message; this lets the owner either reactivate
// in one click or sign out and leave it offline.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { PublicTenant } from '@/lib/tenant';

export function InactiveTenantPanel({ tenant }: { tenant: PublicTenant }) {
  const supabase = createClient();
  const [loading, setLoading] = useState<'reactivate' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reactivate() {
    setLoading('reactivate');
    setError(null);
    try {
      const res = await fetch('/api/admin/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Gagal mengaktifkan toko');
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengaktifkan toko');
      setLoading(null);
    }
  }

  async function signOut() {
    setLoading('signout');
    await supabase.auth.signOut();
    window.location.href = 'https://sajian.app';
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div
        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em]"
        style={{ color: '#dc2626' }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#dc2626' }} />
        Toko offline
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{tenant.name} sedang mati</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Storefront kamu saat ini nggak nerima pesanan dari pelanggan. Aktifkan kembali kapan pun
        kamu siap — menu, pengaturan, dan pesanan lama masih utuh.
      </p>

      <div className="mt-8 space-y-3">
        <button
          onClick={reactivate}
          disabled={loading !== null}
          className="w-full h-12 rounded-full font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: tenant.colors.primary }}
        >
          {loading === 'reactivate' && <Loader2 className="h-4 w-4 animate-spin" />}
          Aktifkan toko sekarang
        </button>

        <button
          onClick={signOut}
          disabled={loading !== null}
          className="w-full h-12 rounded-full border border-zinc-200 hover:border-zinc-400 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading === 'signout' && <Loader2 className="h-4 w-4 animate-spin" />}
          Keluar
        </button>
      </div>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
