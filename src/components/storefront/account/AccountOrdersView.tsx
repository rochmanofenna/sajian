'use client';

// /akun/pesanan — tenant-scoped order history for the signed-in
// customer. Newest first. Each row links to /track/[id] so the customer
// can re-open QR / payment details / status.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { formatCurrency } from '@/lib/utils';
import { formatOrderBranchSuffix } from '@/lib/orders/display';
import { PageNav } from '@/components/chrome/PageNav';

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total: number;
  branch_name: string | null;
  order_type: string;
  items: Array<{ name: string; quantity: number }>;
  created_at: string;
}

export function AccountOrdersView({ tenant }: { tenant: PublicTenant }) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthed, setUnauthed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/customer/orders', { cache: 'no-store' });
        if (res.status === 401) {
          setUnauthed(true);
          return;
        }
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? 'Gagal memuat');
        setOrders(body.orders ?? []);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const primary = tenant.colors.primary;

  if (unauthed) {
    return (
      <>
        <PageNav label="Pesanan" backHref="/akun" />
        <div className="max-w-md mx-auto py-10 px-4 text-center">
          <Link
            href="/?login=1"
            className="inline-flex h-11 px-5 rounded-full text-white text-sm items-center"
            style={{ background: primary }}
          >
            Masuk untuk lihat pesanan
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageNav label="Pesanan saya" backHref="/akun" />
      <div className="max-w-md mx-auto px-4 py-6 space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {orders === null ? (
          <div className="flex justify-center py-10 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border p-6 text-center text-sm text-zinc-500 bg-white">
            Belum ada pesanan.
            <div className="mt-3">
              <Link
                href="/menu"
                className="inline-flex h-10 px-4 rounded-full text-white text-sm items-center"
                style={{ background: primary }}
              >
                Mulai pesan
              </Link>
            </div>
          </div>
        ) : (
          orders.map((o) => (
            <Link
              key={o.id}
              href={`/track/${o.id}`}
              className="block rounded-2xl border p-4 bg-white hover:bg-zinc-50"
              style={{ borderColor: `${primary}18` }}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">#{o.order_number}</span>
                <span className="text-xs uppercase tracking-wide opacity-70">
                  {o.payment_status}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {new Date(o.created_at).toLocaleString('id-ID', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {(() => {
                  const b = formatOrderBranchSuffix(o.branch_name);
                  return b ? ` · ${b}` : '';
                })()}
              </div>
              <div className="text-xs text-zinc-600 mt-2 line-clamp-1">
                {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs capitalize text-zinc-500">
                  {o.order_type.replace('_', ' ')}
                </span>
                <span className="font-semibold" style={{ color: primary }}>
                  {formatCurrency(o.total, tenant.currency_symbol, tenant.locale)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
