'use client';

// Menu fetcher + list. Drives order type, branch, cart add.
// Menu comes from /api/menu which resolves visitPurposeID dynamically.
//
// ESB nests items two levels deep:
//   menuCategories[]          (e.g. "BAKERY")
//     menuCategoryDetails[]   (e.g. "VIENNOSERIE")
//       menus[]               (items)
// Price lives on `sellPrice` with `price` as fallback. `flagSoldOut` gates the
// add-to-cart button.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import type { OrderType } from '@/lib/cart/store';
import { useCart } from '@/lib/cart/store';
import { formatCurrency } from '@/lib/utils';
import type { ESBMenuCategory, ESBMenuCategoryDetail, ESBMenuItem } from '@/lib/esb/types';

interface MenuResponse {
  source: 'esb' | 'sajian_native';
  visitPurpose?: string;
  menu: { menuCategories: ESBMenuCategory[] };
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
];

function itemPrice(item: ESBMenuItem): number {
  // ESB occasionally returns 0 for `price` when `sellPrice` is authoritative.
  return item.sellPrice ?? item.price ?? item.originalSellPrice ?? item.originalPrice ?? 0;
}

function itemImage(item: ESBMenuItem): string | undefined {
  return item.imageOptimUrl ?? item.imageUrl ?? item.imageThumbnailUrl;
}

export function MenuView({ tenant }: { tenant: PublicTenant }) {
  const branchCode = useCart((s) => s.branchCode);
  const orderType = useCart((s) => s.orderType);
  const setOrderType = useCart((s) => s.setOrderType);
  const addItem = useCart((s) => s.addItem);

  const [menu, setMenu] = useState<MenuResponse['menu'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderType) setOrderType('takeaway');
  }, [orderType, setOrderType]);

  useEffect(() => {
    if (!branchCode || !orderType) return;
    setLoading(true);
    setError(null);

    fetch(`/api/menu?branch=${branchCode}&orderType=${orderType}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Gagal memuat menu');
        return body as MenuResponse;
      })
      .then((data) => {
        // ESB sometimes wraps response in { data: ... }
        const raw: unknown = data.menu;
        const menuObj =
          raw && typeof raw === 'object' && 'data' in raw
            ? ((raw as { data?: MenuResponse['menu'] }).data ?? null)
            : (raw as MenuResponse['menu']);
        setMenu(menuObj);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [branchCode, orderType]);

  // Flatten: one section per menuCategoryDetail, grouped under its parent
  // category heading. Skip empty subcategories.
  const sections = useMemo(() => {
    if (!menu?.menuCategories) return [];
    const out: Array<{
      categoryName: string;
      subName: string;
      key: string;
      items: ESBMenuItem[];
    }> = [];
    for (const cat of menu.menuCategories) {
      const subs: ESBMenuCategoryDetail[] = cat.menuCategoryDetails ?? [];
      for (const sub of subs) {
        const items = (sub.menus ?? []).filter((m) => !sub.flagSoldOut);
        if (items.length === 0) continue;
        out.push({
          categoryName: cat.menuCategoryDesc,
          subName: sub.menuCategoryDetailDesc,
          key: `${cat.menuCategoryID}:${sub.menuCategoryDetailID}`,
          items,
        });
      }
    }
    return out;
  }, [menu]);

  if (!branchCode) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center text-zinc-600">
        Pilih cabang dulu di halaman utama.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex gap-2 overflow-x-auto pb-4 border-b" style={{ borderColor: `${tenant.colors.primary}20` }}>
        {ORDER_TYPES.map((t) => {
          const active = orderType === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              className="px-4 h-9 rounded-full text-sm font-medium whitespace-nowrap"
              style={
                active
                  ? { background: tenant.colors.primary, color: 'white' }
                  : { background: 'white', color: tenant.colors.dark, border: `1px solid ${tenant.colors.primary}30` }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-10 text-zinc-500 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat menu…
        </div>
      )}
      {error && <div className="py-6 text-red-600">{error}</div>}

      {!loading && !error && sections.length === 0 && menu && (
        <div className="py-10 text-center text-zinc-500">Menu kosong untuk cabang ini.</div>
      )}

      {!loading && !error && sections.length > 0 && (
        <div className="space-y-8 py-6">
          {sections.map((s) => (
            <section key={s.key}>
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wide text-zinc-400">{s.categoryName}</div>
                <h2 className="text-lg font-semibold" style={{ color: tenant.colors.primary }}>
                  {s.subName}
                </h2>
              </div>
              <div className="grid gap-3">
                {s.items.map((item) => (
                  <MenuRow
                    key={item.menuID}
                    tenant={tenant}
                    item={item}
                    onAdd={() =>
                      addItem(
                        {
                          menuItemId: String(item.menuID),
                          esbMenuId: tenant.pos_provider === 'esb' ? String(item.menuID) : undefined,
                          name: item.menuName,
                          price: itemPrice(item),
                          quantity: 1,
                          modifiers: [],
                          imageUrl: itemImage(item),
                        },
                        tenant.slug,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  tenant,
  item,
  onAdd,
}: {
  tenant: PublicTenant;
  item: ESBMenuItem;
  onAdd: () => void;
}) {
  const unavailable = item.flagSoldOut === true;
  const price = itemPrice(item);
  const img = itemImage(item);
  return (
    <div
      className="flex items-center gap-3 border rounded-xl p-3 bg-white"
      style={{ borderColor: `${tenant.colors.primary}15` }}
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={item.menuName} className="h-16 w-16 rounded-lg object-cover" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.menuName}</div>
        {item.description && (
          <div className="text-xs text-zinc-500 line-clamp-2">{item.description}</div>
        )}
        <div className="mt-1 text-sm font-semibold" style={{ color: tenant.colors.primary }}>
          {formatCurrency(price, tenant.currency_symbol, tenant.locale)}
          {unavailable && <span className="ml-2 text-xs text-zinc-400 font-normal">(sold out)</span>}
        </div>
      </div>
      <button
        onClick={onAdd}
        disabled={unavailable}
        className="h-9 w-9 rounded-full flex items-center justify-center text-white disabled:opacity-40"
        style={{ background: tenant.colors.primary }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
