'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Tenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';

export function CheckoutView({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const {
    items,
    branchCode,
    orderType,
    tableNumber,
    deliveryAddress,
    setTableNumber,
    setDeliveryAddress,
    getSubtotal,
    clear,
  } = useCart();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const canSubmit =
    items.length > 0 &&
    branchCode &&
    orderType &&
    name.trim().length >= 2 &&
    phone.trim().length >= 6 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/order/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchCode,
          orderType,
          paymentMethod: 'cashier',
          tableNumber: orderType === 'dine_in' ? tableNumber : null,
          deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          items,
          customerNotes: notes.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal memproses pesanan');
      clear();
      router.replace(`/track/${body.orderId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memproses pesanan');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-semibold">Pembayaran</h1>

      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${tenant.colors.primary}15` }}>
        <Label text="Nama" />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border border-zinc-200 bg-white"
          placeholder="Nama lengkap"
        />

        <Label text="No. WhatsApp" />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border border-zinc-200 bg-white"
          placeholder="0812xxxxxxxx"
        />

        {orderType === 'dine_in' && (
          <>
            <Label text="Nomor meja" />
            <input
              type="text"
              value={tableNumber ?? ''}
              onChange={(e) => setTableNumber(e.target.value || null)}
              className="w-full h-11 px-3 rounded-lg border border-zinc-200 bg-white"
              placeholder="e.g. 12"
            />
          </>
        )}

        {orderType === 'delivery' && (
          <>
            <Label text="Alamat pengiriman" />
            <textarea
              value={deliveryAddress ?? ''}
              onChange={(e) => setDeliveryAddress(e.target.value || null)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white"
              placeholder="Alamat lengkap + patokan"
            />
          </>
        )}

        <Label text="Catatan (opsional)" />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white"
          placeholder="Pedas sedikit, tanpa bawang, dll."
        />
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: `${tenant.colors.primary}15` }}>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Total</span>
          <span className="text-lg font-semibold">
            {formatCurrency(subtotal, tenant.currency_symbol, tenant.locale)}
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Bayar di kasir. Kamu akan mendapat QR yang ditunjukkan ke kasir untuk finalisasi pesanan.
        </p>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full h-12 rounded-full text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: tenant.colors.primary }}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? 'Memproses…' : 'Pesan Sekarang'}
      </button>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <div className="text-xs font-medium text-zinc-600">{text}</div>;
}
