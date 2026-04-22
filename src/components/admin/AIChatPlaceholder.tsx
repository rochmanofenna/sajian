'use client';

// Placeholder for the live-ops AI chat tab. Building the action layer that
// mutates production tenants + menu items is its own mini-project; shipping
// the rest of the dashboard first.

import { MessagesSquare } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';

export function AIChatPlaceholder({ tenant }: { tenant: PublicTenant }) {
  const primary = tenant.colors.primary;
  return (
    <div className="max-w-2xl rounded-2xl border border-dashed border-zinc-300 p-8 text-center">
      <div
        className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: `${primary}12`, color: primary }}
      >
        <MessagesSquare className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold">AI management — coming next</h3>
      <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto leading-relaxed">
        Ngobrol sama AI buat ubah menu, warna, jam buka. Contoh: &ldquo;Nasi goreng habis hari ini&rdquo; → langsung nonaktif.
        &ldquo;Ganti warna jadi lebih gelap&rdquo; → warna toko di-update.
      </p>
      <p className="mt-3 text-xs text-zinc-400">
        Untuk sekarang, edit menu dan warna manual di tab Menu &amp; Toko.
      </p>
    </div>
  );
}
