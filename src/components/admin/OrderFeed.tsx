'use client';

// Live order feed backed by Supabase Realtime. On mount: fetches last 50
// orders, then subscribes to INSERT/UPDATE on public.orders filtered by
// tenant_id. Browser client uses the anon key + RLS policy "Customers can
// read orders" (Phase 1 permissive; Phase 2 gates by auth).

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import type { Tenant } from '@/lib/tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';

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

const STATUS_ORDER = ['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'] as const;
type OrderStatus = typeof STATUS_ORDER[number];

export function OrderFeed({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setOrders(data as OrderRow[]);
        }
        setLoading(false);
      });

    channel = supabase
      .channel(`tenant:${tenant.id}:orders`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenant.id}` },
        (payload) => {
          setOrders((current) => {
            if (payload.eventType === 'INSERT') {
              return [payload.new as OrderRow, ...current].slice(0, 100);
            }
            if (payload.eventType === 'UPDATE') {
              return current.map((o) => (o.id === (payload.new as OrderRow).id ? (payload.new as OrderRow) : o));
            }
            if (payload.eventType === 'DELETE') {
              return current.filter((o) => o.id !== (payload.old as OrderRow).id);
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
  }, [tenant.id]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    // Optimistic update
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
      // Re-fetch to reconcile.
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (data) setOrders((cur) => cur.map((o) => (o.id === id ? (data as OrderRow) : o)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat pesanan…
      </div>
    );
  }
  if (error) return <div className="text-red-600 py-4">{error}</div>;
  if (orders.length === 0) {
    return <div className="text-center py-20 text-zinc-500">Belum ada pesanan hari ini.</div>;
  }

  return (
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
              <div className="flex items-center gap-2">
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
