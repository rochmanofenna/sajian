'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';

export function CartView({ tenant }: { tenant: PublicTenant }) {
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getSubtotal());
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const branchCode = useCart((s) => s.branchCode);

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-xl font-semibold">Cart kosong</h1>
        <p className="text-zinc-600">Yuk pilih menu dulu.</p>
        <Link
          href="/menu"
          className="inline-flex h-11 items-center px-5 rounded-full text-white font-medium"
          style={{ background: tenant.colors.primary }}
        >
          Ke menu
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Cart</h1>

      <div className="space-y-3">
        {items.map((item) => {
          const modSum = item.modifiers.reduce((s, m) => s + m.priceDelta, 0);
          const lineTotal = (item.price + modSum) * item.quantity;
          return (
            <div
              key={item.lineId}
              className="flex items-center gap-3 border rounded-xl p-3 bg-white"
              style={{ borderColor: `${tenant.colors.primary}15` }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{item.name}</div>
                {item.notes && <div className="text-xs text-zinc-500">{item.notes}</div>}
                <div className="text-sm font-semibold mt-1" style={{ color: tenant.colors.primary }}>
                  {formatCurrency(lineTotal, tenant.currency_symbol, tenant.locale)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                  className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center font-medium">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                  className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => removeItem(item.lineId)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t pt-4 flex items-center justify-between">
        <span className="text-zinc-600">Subtotal</span>
        <span className="text-lg font-semibold">
          {formatCurrency(subtotal, tenant.currency_symbol, tenant.locale)}
        </span>
      </div>

      <Link
        href="/checkout"
        aria-disabled={!branchCode}
        className="mt-6 block text-center h-12 leading-[3rem] rounded-full text-white font-medium"
        style={{ background: tenant.colors.primary }}
      >
        Lanjut ke Pembayaran
      </Link>
      {!branchCode && (
        <p className="mt-2 text-xs text-center text-zinc-500">Pilih cabang dulu dari halaman utama.</p>
      )}
    </div>
  );
}
