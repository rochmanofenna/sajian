'use client';

// Tracking page. Handles three flows:
//
//   cashier      → show QR or order number for the cashier to pick up.
//   qris         → show Xendit QR + 30-min countdown; poll /api/order/{id}
//                  until payment_status flips to 'paid'.
//   dana/ovo/…   → user is redirected out and back; on return we poll the
//                  same endpoint. If there's a payment_redirect_url and
//                  status still pending, we show a "Buka app lagi" button.
//
// Poll cadence is 3s while pending, pauses on 'paid'/'failed'/'expired'.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Loader2,
  Home,
  Utensils,
  CheckCircle2,
  XCircle,
  Timer,
  ExternalLink,
  UserPlus,
} from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { formatCurrency } from '@/lib/utils';
import { formatOrderLocationLabel } from '@/lib/orders/display';
import { PageNav } from '@/components/chrome/PageNav';
import { LoginDialog } from './auth/LoginDialog';

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  payment_qr_string: string | null;
  payment_redirect_url: string | null;
  payment_expires_at: string | null;
  total: number;
  branch_name: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
  created_at: string;
  guest_contact: { name?: string; phone?: string; email?: string | null } | null;
}

interface SessionShape {
  account: { id: string; email: string };
}

export function TrackView({ tenant, orderId }: { tenant: PublicTenant; orderId: string }) {
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [session, setSession] = useState<SessionShape | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/customer/me', { cache: 'no-store' });
      const body = await res.json();
      setSession((body?.session as SessionShape | null) ?? null);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Poll the order — stops once we hit a terminal state.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/order/${orderId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Gagal memuat pesanan');
        if (!cancelled) setOrder(body.order as OrderRow);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat pesanan');
      }
    };

    tick();
    const iv = setInterval(() => {
      if (cancelled) return;
      // Stop polling once terminal.
      if (order && ['paid', 'failed', 'expired', 'refunded'].includes(order.payment_status)) {
        clearInterval(iv);
        return;
      }
      tick();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [orderId, order?.payment_status]);

  // Render QR as inline SVG in tenant primary color.
  useEffect(() => {
    if (!order?.payment_qr_string) {
      setQrSvg(null);
      return;
    }
    QRCode.toString(order.payment_qr_string, {
      type: 'svg',
      margin: 1,
      width: 280,
      color: { dark: tenant.colors.primary, light: '#00000000' },
    })
      .then(setQrSvg)
      .catch(() => setQrSvg(null));
  }, [order?.payment_qr_string, tenant.colors.primary]);

  // Live clock for the countdown; only ticks when QR has an expiry.
  useEffect(() => {
    if (!order?.payment_expires_at) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [order?.payment_expires_at]);

  const primary = tenant.colors.primary;

  const countdown = useMemo(() => {
    if (!order?.payment_expires_at) return null;
    const ms = new Date(order.payment_expires_at).getTime() - now;
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [order?.payment_expires_at, now]);

  // Local expiry fallback — if the QR deadline has been past for 5s and the
  // webhook hasn't flipped the status yet, surface an inline warning so the
  // customer isn't staring at a spinner indefinitely. The webhook will still
  // catch up and flip payment_status to 'expired' when it arrives. Cheap to
  // compute, no memoization needed.
  const likelyExpiredLocally =
    !!order?.payment_expires_at &&
    order.payment_status === 'pending' &&
    new Date(order.payment_expires_at).getTime() + 5000 < now;

  if (error) {
    return (
      <>
        <PageNav label="Pesanan" backHref="/" />
        <div className="max-w-md mx-auto py-16 px-4 text-red-600 text-center">{error}</div>
      </>
    );
  }
  if (!order) {
    return (
      <>
        <PageNav label="Pesanan" backHref="/" caption="memuat…" />
        <div className="max-w-md mx-auto py-16 px-4 flex items-center justify-center text-zinc-500 gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat pesanan…
        </div>
      </>
    );
  }

  const isCashier = order.payment_method === 'cashier';
  const isQRIS = order.payment_method === 'qris';
  const isEWallet = ['dana', 'ovo', 'shopeepay', 'gopay'].includes(order.payment_method);
  const isPaid = order.payment_status === 'paid';
  const isExpired = order.payment_status === 'expired';
  const isFailed = order.payment_status === 'failed';

  return (
    <>
      <PageNav
        label={`Pesanan · #${order.order_number}`}
        backHref="/"
        caption={formatOrderLocationLabel({
          branchName: order.branch_name,
          tenantName: tenant.name,
        })}
      />
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="text-center">
          <h1
            className="text-3xl font-semibold"
            style={{ color: primary, fontFamily: 'var(--font-display, serif)' }}
          >
            #{order.order_number}
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            {formatOrderLocationLabel({
              branchName: order.branch_name,
              tenantName: tenant.name,
            })}
          </p>
        </div>

        {/* Paid state — celebrate. */}
        {isPaid && (
          <div
            className="rounded-2xl p-5 text-center space-y-2"
            style={{ background: `${primary}10`, border: `1px solid ${primary}30` }}
          >
            <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: primary }} />
            <div className="text-lg font-semibold">Pembayaran berhasil</div>
            <p className="text-sm text-zinc-600">
              Pesanan kamu lagi disiapin. Notifikasi update bakal masuk ke WhatsApp kamu.
            </p>
          </div>
        )}

        {/* Failed / expired — give retry hint. */}
        {(isFailed || isExpired) && (
          <div className="rounded-2xl p-5 text-center space-y-2 bg-red-50 border border-red-200">
            <XCircle className="h-10 w-10 mx-auto text-red-500" />
            <div className="text-lg font-semibold text-red-700">
              {isExpired ? 'Pembayaran kadaluarsa' : 'Pembayaran gagal'}
            </div>
            <p className="text-sm text-red-600">
              Coba lagi dari halaman menu. Tidak ada biaya yang dipotong.
            </p>
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-red-600 text-white text-sm"
            >
              Kembali ke menu
            </Link>
          </div>
        )}

        {/* QRIS — show QR + countdown while pending. */}
        {isQRIS && order.payment_qr_string && !isPaid && !isFailed && !isExpired && (
          <div
            className="rounded-2xl border p-6 bg-white text-center space-y-3"
            style={{ borderColor: `${primary}20` }}
          >
            <h2 className="font-semibold">Scan QR ini untuk bayar</h2>
            <p className="text-xs text-zinc-500">
              Buka app bank apapun (BCA, Mandiri, OVO, GoPay, DANA…) → scan
            </p>
            {qrSvg ? (
              <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {countdown && (
              <div
                className="inline-flex items-center gap-2 text-sm font-medium"
                style={{ color: likelyExpiredLocally ? '#b91c1c' : primary }}
              >
                <Timer className="h-4 w-4" />
                {likelyExpiredLocally ? 'QR kadaluarsa' : `QR berlaku ${countdown}`}
              </div>
            )}
            {likelyExpiredLocally ? (
              <div className="text-xs text-red-600 space-y-2">
                <p>QR ini udah lewat masa berlakunya. Coba bikin pesanan ulang di menu.</p>
                <Link
                  href="/menu"
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-red-600 text-white text-xs"
                >
                  Kembali ke menu
                </Link>
              </div>
            ) : (
              <div className="text-xs text-zinc-500 flex items-center justify-center gap-2 pt-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Menunggu konfirmasi pembayaran…
              </div>
            )}
          </div>
        )}

        {/* E-wallet — in case redirect dropped the user back without paying. */}
        {isEWallet && !isPaid && !isFailed && !isExpired && (
          <div
            className="rounded-2xl border p-6 bg-white text-center space-y-3"
            style={{ borderColor: `${primary}20` }}
          >
            <Loader2 className="h-8 w-8 mx-auto animate-spin" style={{ color: primary }} />
            <h2 className="font-semibold">Menunggu pembayaran {order.payment_method.toUpperCase()}</h2>
            <p className="text-sm text-zinc-600">
              Selesaiin pembayaran di app, lalu kembali ke sini. Status akan update otomatis.
            </p>
            {order.payment_redirect_url && (
              <a
                href={order.payment_redirect_url}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-white font-medium text-sm"
                style={{ background: primary }}
              >
                Buka app lagi
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Cashier — legacy flow (QR or number). */}
        {isCashier && order.payment_qr_string && (
          <div
            className="rounded-2xl border p-6 bg-white text-center space-y-3"
            style={{ borderColor: `${primary}20` }}
          >
            <h2 className="font-semibold">Tunjukkan QR ini ke kasir</h2>
            <p className="text-xs text-zinc-500">
              Kasir akan scan dari POS untuk memfinalisasi pesanan
            </p>
            {qrSvg ? (
              <div
                className="flex justify-center"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
        )}

        {isCashier && !order.payment_qr_string && (
          <div
            className="rounded-2xl border p-6 bg-white text-center space-y-2"
            style={{ borderColor: `${primary}20` }}
          >
            <h2 className="font-semibold">Tunjukkan nomor pesanan ke kasir</h2>
            <div
              className="text-5xl font-bold tracking-wider"
              style={{ color: primary, fontFamily: 'var(--font-display, serif)' }}
            >
              #{order.order_number}
            </div>
            <p className="text-xs text-zinc-500">
              Kasir akan konfirmasi pesanan kamu di dashboard
            </p>
          </div>
        )}

        {/* Order summary. */}
        <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: `${primary}15` }}>
          <h3 className="font-medium mb-2">Ringkasan</h3>
          <div className="space-y-1 text-sm">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex justify-between">
                <span>
                  {it.quantity}× {it.name}
                </span>
                <span>{formatCurrency(it.price * it.quantity, tenant.currency_symbol, tenant.locale)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t pt-3 flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatCurrency(order.total, tenant.currency_symbol, tenant.locale)}</span>
          </div>
        </div>

        <div className="text-center text-xs text-zinc-500">
          Status: <span className="font-medium text-zinc-700">{order.status}</span> · Pembayaran:{' '}
          <span className="font-medium text-zinc-700">{order.payment_status}</span>
        </div>

        {!session && order.guest_contact?.email && !signupDone && (
          <div
            className="rounded-2xl border p-5 bg-white space-y-3"
            style={{ borderColor: `${primary}25` }}
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" style={{ color: primary }} />
              <h3 className="font-semibold">Daftar dengan email ini</h3>
            </div>
            <p className="text-sm text-zinc-600">
              Simpan pesanan & alamat biar next time tinggal tap. Cukup verifikasi kode ke{' '}
              <span className="font-medium">{order.guest_contact.email}</span>.
            </p>
            <button
              type="button"
              onClick={() => setSignupOpen(true)}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-white text-sm font-medium"
              style={{ background: primary }}
            >
              Ya, daftar sekarang
            </button>
          </div>
        )}

        {signupDone && (
          <div
            className="rounded-2xl border p-4 text-sm text-center"
            style={{ borderColor: `${primary}30`, background: `${primary}08`, color: tenant.colors.dark }}
          >
            Akun kamu siap. Pesanan ini udah nyambung ke profil.
          </div>
        )}

        <div className="pt-2 flex items-center justify-center gap-2">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 h-11 px-4 rounded-full border border-zinc-200 bg-white text-sm hover:border-zinc-400"
          >
            <Utensils className="h-3.5 w-3.5" />
            Pesan lagi
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 h-11 px-4 rounded-full border border-zinc-200 bg-white text-sm hover:border-zinc-400"
          >
            <Home className="h-3.5 w-3.5" />
            Beranda
          </Link>
        </div>
      </div>
      <LoginDialog
        tenant={tenant}
        open={signupOpen}
        onClose={() => setSignupOpen(false)}
        initialEmail={order.guest_contact?.email ?? undefined}
        onSuccess={async () => {
          await refreshSession();
          try {
            await fetch('/api/customer/link-guest-orders', { method: 'POST' });
          } catch {
            // Non-fatal — the signup worked; linkage can be re-driven later
            // from /akun/pesanan if needed.
          }
          setSignupDone(true);
        }}
      />
    </>
  );
}
