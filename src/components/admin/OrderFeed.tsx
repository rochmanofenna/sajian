'use client';

// Live order feed backed by Supabase Realtime. On mount: fetches last 50
// orders, then subscribes to INSERT/UPDATE on public.orders filtered by
// tenant_id. Browser client uses the anon key + RLS policy "Customers can
// read orders" (Phase 1 permissive; Phase 2 gates by auth).
//
// Notifications: after the initial hydrate, new INSERTs and payment_status
// flips to 'paid' fire a chime + OS notification (if owner opted in) plus an
// always-visible in-page toast. Hydration gate prevents the whole first page
// of orders from chiming on every reload.

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Bell, Loader2, X } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import {
  canNotify,
  disableNotifications,
  enableNotifications,
  playChime,
  sendNotification,
  useNotifPref,
} from '@/lib/notify/browser';
import { ShareCard } from './ShareCard';

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  items: Array<{ name: string; quantity: number }>;
  total: number;
  order_type: string;
  payment_method: string;
  payment_status: string;
  status: string;
  branch_name: string | null;
  created_at: string;
  esb_order_id: string | null;
}

interface ToastMsg {
  id: string;
  title: string;
  body: string;
}

const STATUS_ORDER = ['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'] as const;
type OrderStatus = typeof STATUS_ORDER[number];

export function OrderFeed({ tenant }: { tenant: PublicTenant }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const { pref: notifPref, permission } = useNotifPref();

  const hydratedRef = useRef(false);
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  // Banner shows once — when the browser hasn't been asked yet and the owner
  // hasn't explicitly dismissed. Clicking "Aktifkan" or "Nanti saja" flips
  // pref away from 'unset', which hides the banner permanently.
  const showEnableBanner = permission === 'default' && notifPref === 'unset';

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    supabase
      .from('orders')
      .select(
        'id, order_number, customer_name, customer_phone, items, total, order_type, payment_method, payment_status, status, branch_name, created_at, esb_order_id',
      )
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          const rows = data as OrderRow[];
          setOrders(rows);
          const map = new Map<string, string>();
          for (const o of rows) map.set(o.id, o.payment_status);
          prevStatusRef.current = map;
        }
        setLoading(false);
        hydratedRef.current = true;
      });

    channel = supabase
      .channel(`tenant:${tenant.id}:orders`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenant.id}` },
        (payload) => {
          setOrders((current) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as OrderRow;
              if (hydratedRef.current) {
                fireOrderAlert(row, tenant, setToasts);
              }
              prevStatusRef.current.set(row.id, row.payment_status);
              return [row, ...current].slice(0, 100);
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as OrderRow;
              const prev = prevStatusRef.current.get(row.id);
              prevStatusRef.current.set(row.id, row.payment_status);
              if (hydratedRef.current && prev !== 'paid' && row.payment_status === 'paid') {
                firePaymentAlert(row, tenant, setToasts);
              }
              return current.map((o) => (o.id === row.id ? row : o));
            }
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as OrderRow).id;
              prevStatusRef.current.delete(id);
              return current.filter((o) => o.id !== id);
            }
            return current;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenant]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'update failed');
      }
    } catch (err) {
      console.error('[admin] update status failed:', err);
      const supabase = createClient();
      const { data } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (data) setOrders((cur) => cur.map((o) => (o.id === id ? (data as OrderRow) : o)));
    }
  };

  async function onEnable() {
    await enableNotifications();
  }

  function onDismissBanner() {
    // Flip pref to 'no' so the banner never re-appears; owner can still
    // re-enable later via the 🔔 toggle in AdminTabs.
    disableNotifications();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat pesanan…
      </div>
    );
  }
  if (error) return <div className="text-red-600 py-4">{error}</div>;

  return (
    <>
      <ToastStack toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {showEnableBanner && (
        <div
          className="rounded-2xl border p-4 flex items-start gap-3 mb-4"
          style={{ borderColor: `${tenant.colors.primary}33`, background: `${tenant.colors.primary}08` }}
        >
          <span
            className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: `${tenant.colors.primary}18`, color: tenant.colors.primary }}
          >
            <Bell className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-medium">Aktifkan notifikasi pesanan</div>
            <p className="text-zinc-600 mt-0.5">
              Dapet bunyi + notifikasi browser setiap ada pesanan baru. Biar gak ada yang kelewat.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onEnable}
                className="h-9 px-4 rounded-full text-white text-xs font-medium"
                style={{ background: tenant.colors.primary }}
              >
                Aktifkan
              </button>
              <button
                onClick={onDismissBanner}
                className="h-9 px-4 rounded-full border border-zinc-200 text-xs hover:border-zinc-400"
              >
                Nanti saja
              </button>
            </div>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <ShareCard tenant={tenant} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Live Orders</h1>
            <span className="text-xs text-zinc-500">{orders.length} pesanan terbaru</span>
          </div>

          <div className="grid gap-3">
            {orders.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: `${tenant.colors.primary}15` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">#{o.order_number}</span>
                    <Badge status={o.status} color={tenant.colors.primary} />
                    <Badge status={o.payment_status} color={tenant.colors.accent} />
                    <span className="text-xs text-zinc-500">
                      {o.order_type.replace('_', ' ')} · {o.payment_method}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-700">
                    {o.customer_name ?? '—'} ·{' '}
                    <span className="font-mono text-xs">{o.customer_phone ?? '—'}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 truncate">
                    {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {o.branch_name ?? '—'} · {formatRelativeTime(o.created_at)}
                    {o.esb_order_id && <span className="font-mono"> · ESB:{o.esb_order_id}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {formatCurrency(o.total, tenant.currency_symbol, tenant.locale)}
                    </div>
                  </div>
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                    className="h-9 px-2 rounded-lg border border-zinc-200 bg-white text-sm"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function fireOrderAlert(
  row: OrderRow,
  tenant: PublicTenant,
  setToasts: React.Dispatch<React.SetStateAction<ToastMsg[]>>,
) {
  const total = formatCurrency(row.total, tenant.currency_symbol, tenant.locale);
  const title = `Pesanan baru · #${row.order_number}`;
  const body = `${row.customer_name ?? 'Pelanggan'} — ${total}`;
  pushToast(setToasts, { id: `ins-${row.id}`, title, body });
  if (canNotify()) {
    playChime();
    sendNotification({ title, body, tag: `order-${row.id}` });
  }
}

function firePaymentAlert(
  row: OrderRow,
  tenant: PublicTenant,
  setToasts: React.Dispatch<React.SetStateAction<ToastMsg[]>>,
) {
  const total = formatCurrency(row.total, tenant.currency_symbol, tenant.locale);
  const title = `Pembayaran masuk · #${row.order_number}`;
  const body = `${row.customer_name ?? 'Pelanggan'} — ${total}`;
  pushToast(setToasts, { id: `pay-${row.id}`, title, body });
  if (canNotify()) {
    playChime();
    sendNotification({ title, body, tag: `pay-${row.id}` });
  }
}

function pushToast(
  setToasts: React.Dispatch<React.SetStateAction<ToastMsg[]>>,
  msg: ToastMsg,
) {
  setToasts((cur) => [msg, ...cur].slice(0, 3));
  setTimeout(() => {
    setToasts((cur) => cur.filter((t) => t.id !== msg.id));
  }, 8000);
}

function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastMsg[];
  onClose: (id: string) => void;
}) {
  const { active } = useNotifPref();
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-xl shadow-lg bg-white border border-zinc-200 p-3 pr-9 relative animate-[slideIn_0.2s_ease-out]"
          role="status"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
            {active ? 'Notifikasi aktif' : 'Pemberitahuan'}
          </div>
          <div className="font-semibold text-sm">{t.title}</div>
          <div className="text-sm text-zinc-600">{t.body}</div>
          <button
            onClick={() => onClose(t.id)}
            className="absolute top-2 right-2 h-6 w-6 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400"
            aria-label="Tutup"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Badge({ status, color }: { status: string; color: string }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: `${color}15`, color }}
    >
      {status}
    </span>
  );
}
