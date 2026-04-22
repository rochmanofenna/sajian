'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, Wallet, Store } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';
import { PageNav } from '@/components/chrome/PageNav';
import type { PaymentMethod } from '@/lib/order/schema';

interface MethodDef {
  value: PaymentMethod;
  label: string;
  sub: string;
  icon: 'qr' | 'wallet' | 'store';
}

const METHODS: MethodDef[] = [
  { value: 'qris', label: 'QRIS', sub: 'Scan pakai app bank mana aja', icon: 'qr' },
  { value: 'dana', label: 'DANA', sub: 'Redirect ke app DANA', icon: 'wallet' },
  { value: 'ovo', label: 'OVO', sub: 'Redirect ke app OVO', icon: 'wallet' },
  { value: 'shopeepay', label: 'ShopeePay', sub: 'Redirect ke app Shopee', icon: 'wallet' },
  { value: 'cashier', label: 'Bayar di Kasir', sub: 'Tunjukkan QR/nomor ke kasir', icon: 'store' },
];

export function CheckoutView({ tenant }: { tenant: PublicTenant }) {
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
  const [method, setMethod] = useState<PaymentMethod>('qris');
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
          paymentMethod: method,
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

      // E-wallet redirect flow — leave the SPA, come back via success URL.
      if (body.redirectUrl && typeof body.redirectUrl === 'string') {
        window.location.href = body.redirectUrl;
        return;
      }
      router.replace(`/track/${body.orderId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memproses pesanan');
      setSubmitting(false);
    }
  };

  const primary = tenant.colors.primary;

  return (
    <>
      <PageNav
        label="Checkout"
        backHref="/cart"
        caption={formatCurrency(subtotal, tenant.currency_symbol, tenant.locale)}
      />
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: 'var(--font-display, serif)' }}
        >
          Pembayaran
        </h1>

        <div
          className="rounded-2xl border p-4 space-y-3 bg-white"
          style={{ borderColor: `${primary}18` }}
        >
          <Label text="Nama" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
            placeholder="Nama lengkap"
          />

          <Label text="No. WhatsApp" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
            placeholder="0812xxxxxxxx"
          />

          {orderType === 'dine_in' && (
            <>
              <Label text="Nomor meja" />
              <input
                type="text"
                value={tableNumber ?? ''}
                onChange={(e) => setTableNumber(e.target.value || null)}
                className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
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
                className="w-full px-4 py-3 rounded-2xl border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
                placeholder="Alamat lengkap + patokan"
              />
            </>
          )}

          <Label text="Catatan (opsional)" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-2xl border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
            placeholder="Pedas sedikit, tanpa bawang, dll."
          />
        </div>

        <section className="space-y-2" aria-label="Metode pembayaran">
          <Label text="Metode pembayaran" />
          <div className="grid gap-2">
            {METHODS.map((m) => {
              const active = method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-2xl border transition active:scale-[0.99]"
                  style={{
                    borderColor: active ? primary : `${primary}22`,
                    background: active ? `${primary}08` : '#fff',
                  }}
                >
                  <span
                    className="h-11 w-11 rounded-full flex items-center justify-center"
                    style={{
                      background: active ? primary : `${primary}12`,
                      color: active ? '#fff' : primary,
                    }}
                  >
                    {m.icon === 'qr' && <QrCode className="h-5 w-5" />}
                    {m.icon === 'wallet' && <Wallet className="h-5 w-5" />}
                    {m.icon === 'store' && <Store className="h-5 w-5" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-zinc-500">{m.sub}</div>
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: active ? primary : `${primary}44` }}
                  >
                    {active && (
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: primary }} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div
          className="rounded-2xl border p-4 bg-white"
          style={{ borderColor: `${primary}18` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Total</span>
            <span className="text-2xl font-semibold" style={{ color: primary }}>
              {formatCurrency(subtotal, tenant.currency_symbol, tenant.locale)}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {method === 'cashier'
              ? 'Tunjukkan QR / nomor pesanan ke kasir untuk dibayarkan.'
              : method === 'qris'
                ? 'Kamu akan dapat QR untuk discan dari app bank apapun.'
                : 'Kami akan arahkan kamu ke app untuk bayar.'}
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full h-12 rounded-full text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition"
          style={{ background: primary }}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Memproses…' : method === 'cashier' ? 'Pesan Sekarang' : 'Lanjut Bayar'}
        </button>
      </div>
    </>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div
      className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500"
    >
      {text}
    </div>
  );
}
