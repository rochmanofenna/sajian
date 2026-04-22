'use client';

// Live menu editor for sajian_native tenants. Lists every category + its
// items; price and availability edit in place. ESB-backed tenants see a
// read-only view with a note pointing them at their POS portal.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { formatCurrency } from '@/lib/utils';

interface Item {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  items: Item[];
}

interface MenuResponse {
  readonly: boolean;
  categories: Category[];
  orphaned: Item[];
}

export function MenuEditor({ tenant }: { tenant: PublicTenant }) {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/menu')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Gagal memuat menu');
        return body as MenuResponse;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function patch(id: string, changes: Partial<Pick<Item, 'price' | 'is_available' | 'name' | 'description'>>) {
    const res = await fetch(`/api/admin/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Gagal update');
    }
    return (await res.json()).item as Item;
  }

  function applyLocally(id: string, next: Partial<Item>) {
    setData((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        categories: cur.categories.map((c) => ({
          ...c,
          items: c.items.map((it) => (it.id === id ? { ...it, ...next } : it)),
        })),
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat menu…
      </div>
    );
  }
  if (error) return <div className="text-red-600 py-4">{error}</div>;
  if (!data) return null;

  if (data.readonly) {
    return (
      <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
        Menu tenant ini disinkronisasi dari ESB. Edit menu langsung di portal ESB — perubahan akan muncul di sini otomatis.
      </div>
    );
  }

  if (data.categories.length === 0) {
    return <div className="text-center py-20 text-zinc-500">Belum ada kategori menu.</div>;
  }

  return (
    <div className="space-y-8">
      {data.categories.map((cat) => (
        <section key={cat.id}>
          <h2 className="text-lg font-semibold mb-3" style={{ color: tenant.colors.primary }}>
            {cat.name}
            <span className="ml-2 text-xs font-normal text-zinc-400">{cat.items.length} item</span>
          </h2>
          {cat.items.length === 0 ? (
            <div className="text-sm text-zinc-400 italic">Kategori kosong</div>
          ) : (
            <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 bg-white">
              {cat.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  tenant={tenant}
                  onPatch={async (changes) => {
                    const optimistic = { ...item, ...changes };
                    applyLocally(item.id, optimistic);
                    try {
                      await patch(item.id, changes);
                    } catch (e) {
                      applyLocally(item.id, item);
                      alert((e as Error).message);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ItemRow({
  item,
  tenant,
  onPatch,
}: {
  item: Item;
  tenant: PublicTenant;
  onPatch: (changes: Partial<Pick<Item, 'price' | 'is_available' | 'name' | 'description'>>) => Promise<void>;
}) {
  const [priceInput, setPriceInput] = useState(String(item.price));
  const [priceEditing, setPriceEditing] = useState(false);

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{item.name}</div>
        {item.description && (
          <div className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{item.description}</div>
        )}
      </div>

      {priceEditing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const next = parseInt(priceInput, 10);
            if (Number.isFinite(next) && next >= 0) {
              await onPatch({ price: next });
            }
            setPriceEditing(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="number"
            min={0}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            autoFocus
            className="h-8 w-24 px-2 rounded-md border border-zinc-300 text-sm"
          />
          <button type="submit" className="text-xs px-2 h-8 rounded-md bg-zinc-900 text-white">
            Simpan
          </button>
        </form>
      ) : (
        <button
          onClick={() => {
            setPriceInput(String(item.price));
            setPriceEditing(true);
          }}
          className="font-mono text-sm font-medium hover:underline"
          style={{ color: tenant.colors.primary }}
        >
          {formatCurrency(item.price, tenant.currency_symbol, tenant.locale)}
        </button>
      )}

      <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs">
        <input
          type="checkbox"
          checked={item.is_available}
          onChange={(e) => onPatch({ is_available: e.target.checked })}
          className="sr-only peer"
        />
        <span
          className="h-5 w-9 rounded-full bg-zinc-300 peer-checked:bg-emerald-500 relative transition"
          aria-hidden="true"
        >
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
        </span>
        <span className="text-zinc-600 peer-checked:text-zinc-900 w-14">
          {item.is_available ? 'Tersedia' : 'Habis'}
        </span>
      </label>
    </div>
  );
}
