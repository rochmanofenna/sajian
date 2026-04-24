'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, Wallet, Store } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';
import { PageNav } from '@/components/chrome/PageNav';
import type { PaymentMethod } from '@/lib/order/schema';
import {
  formatIdPhoneDisplay,
  isLikelyIdPhone,
  normalizeIdPhone,
} from '@/lib/auth/phone';

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

// ESB-backed tenants route every order through the POS, which only supports
// the cashier flow in Phase 1. Exposing online payments would silently fall
// through to the native Xendit path, creating a charge the POS never sees.
// Gate at the UI so the customer can't pick a method that won't work.
function methodsFor(posProvider: string): MethodDef[] {
  if (posProvider === 'esb') return METHODS.filter((m) => m.value === 'cashier');
  return METHODS;
}

interface SessionShape {
  account: { id: string; email: string; name: string | null; phone: string | null };
}

export function CheckoutView({ tenant }: { tenant: PublicTenant }) {
  const router = useRouter();
  const availableMethods = methodsFor(tenant.pos_provider);
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

  const [session, setSession] = useState<SessionShape | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(() => availableMethods[0]?.value ?? 'cashier');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slowHint, setSlowHint] = useState(false);
  const slowHintTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (slowHintTimer.current !== null) window.clearTimeout(slowHintTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/customer/me', { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        const s = body?.session as SessionShape | null;
        setSession(s);
        if (s) {
          if (s.account.name) setName(s.account.name);
          if (s.account.phone) setPhone(s.account.phone);
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setSessionLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emailValid = email.trim().length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const subtotal = getSubtotal();
  const phoneDisplay = formatIdPhoneDisplay(phone);
  const phoneValid = isLikelyIdPhone(phone);
  const canSubmit =
    items.length > 0 &&
    branchCode &&
    orderType &&
    name.trim().length >= 2 &&
    phoneValid &&
    emailValid &&
    sessionLoaded &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSlowHint(false);
    // ESB round-trips can stretch 10-20s on a bad day. Surface that the
    // request is still alive so the customer doesn't assume it hung.
    slowHintTimer.current = window.setTimeout(() => setSlowHint(true), 12_000);
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
          customerPhone: normalizeIdPhone(phone),
          customerEmail: session ? undefined : email.trim() || undefined,
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
    } finally {
      if (slowHintTimer.current !== null) {
        window.clearTimeout(slowHintTimer.current);
        slowHintTimer.current = null;
      }
      setSlowHint(false);
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

        {session && (
          <div
            className="rounded-2xl border p-3 text-xs bg-white flex items-center gap-2"
            style={{ borderColor: `${primary}22`, color: tenant.colors.dark }}
          >
            <span
              className="h-6 w-6 rounded-full text-white flex items-center justify-center text-[11px]"
              style={{ background: primary }}
            >
              {(session.account.name || session.account.email)[0].toUpperCase()}
            </span>
            <span className="truncate">
              Masuk sebagai <span className="font-medium">{session.account.email}</span>
            </span>
          </div>
        )}

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
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
            placeholder="cth: 0812 3456 7890"
          />
          {phone.trim().length > 0 && (
            <div
              className={`text-xs font-mono ${
                phoneValid ? 'text-zinc-500' : 'text-red-600'
              }`}
            >
              {phoneValid
                ? phoneDisplay
                : 'Masukkan nomor HP Indonesia (0812xxxxxxxx).'}
            </div>
          )}

          {!session && (
            <>
              <Label text="Email (opsional)" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-full border border-zinc-200 bg-white focus:outline-none focus:border-zinc-400"
                placeholder="nama@email.com"
              />
              <p className="text-xs text-zinc-500">
                Isi untuk dapat update pesanan lewat email dan bisa daftar akun setelah bayar.
              </p>
              {email.trim().length > 0 && !emailValid && (
                <p className="text-xs text-red-600">Masukkan email yang valid.</p>
              )}
            </>
          )}

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
            {availableMethods.map((m) => {
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

        {slowHint && submitting && !error && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3">
            Masih diproses — koneksi ke POS agak lambat. Tunggu sebentar lagi…
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
