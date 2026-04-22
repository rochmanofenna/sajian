'use client';

// Tracking page. For cashier orders: renders the QR the customer shows to the
// cashier, plus the queue/order number. For online orders (Phase 2): shows
// payment instructions + polls status.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2 } from 'lucide-react';
import type { Tenant } from '@/lib/tenant';
import { formatCurrency } from '@/lib/utils';

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  payment_qr_string: string | null;
  total: number;
  branch_name: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  created_at: string;
}

export function TrackView({ tenant, orderId }: { tenant: Tenant; orderId: string }) {
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

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
    const iv = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [orderId]);

  useEffect(() => {
    if (!order?.payment_qr_string) return;
    QRCode.toString(order.payment_qr_string, { type: 'svg', margin: 1, width: 280 })
      .then(setQrSvg)
      .catch(() => setQrSvg(null));
  }, [order?.payment_qr_string]);

  if (error) return <div className="max-w-md mx-auto py-16 px-4 text-red-600 text-center">{error}</div>;
  if (!order) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 flex items-center justify-center text-zinc-500 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat pesanan…
      </div>
    );
  }

  const isCashier = order.payment_method === 'cashier';

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold" style={{ color: tenant.colors.primary }}>
          Pesanan #{order.order_number}
        </h1>
        <p className="text-sm text-zinc-600 mt-1">{order.branch_name}</p>
      </div>

      {isCashier && order.payment_qr_string && (
        <div className="rounded-2xl border p-6 bg-white text-center space-y-3" style={{ borderColor: `${tenant.colors.primary}20` }}>
          <h2 className="font-semibold">Tunjukkan QR ini ke kasir</h2>
          <p className="text-xs text-zinc-500">Kasir akan scan dari POS untuk memfinalisasi pesanan</p>
          {qrSvg ? (
            <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>
      )}

      {isCashier && !order.payment_qr_string && (
        <div className="rounded-2xl border p-6 bg-white text-center space-y-2" style={{ borderColor: `${tenant.colors.primary}20` }}>
          <h2 className="font-semibold">Tunjukkan nomor pesanan ke kasir</h2>
          <div className="text-4xl font-bold tracking-wider" style={{ color: tenant.colors.primary }}>
            #{order.order_number}
          </div>
          <p className="text-xs text-zinc-500">Kasir akan konfirmasi pesanan kamu di dashboard</p>
        </div>
      )}

      <div className="rounded-xl border p-4 bg-white" style={{ borderColor: `${tenant.colors.primary}15` }}>
        <h3 className="font-medium mb-2">Ringkasan</h3>
        <div className="space-y-1 text-sm">
          {order.items.map((it, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{it.quantity}× {it.name}</span>
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
        Status: <span className="font-medium text-zinc-700">{order.status}</span> · Pembayaran: <span className="font-medium text-zinc-700">{order.payment_status}</span>
      </div>
    </div>
  );
}
