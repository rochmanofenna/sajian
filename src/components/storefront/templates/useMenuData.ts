'use client';

// Shared data hook for every Menu variant. Owns the fetch, flatten, and
// add-to-cart wiring so each template can focus on presentation.

import { useEffect, useMemo, useState } from 'react';
import type { PublicTenant } from '@/lib/tenant';
import type { OrderType } from '@/lib/cart/store';
import { useCart } from '@/lib/cart/store';
import type { ESBMenuCategory, ESBMenuCategoryDetail, ESBMenuItem } from '@/lib/esb/types';
import type { MenuSection } from './types';
import { itemImage, itemPrice } from './types';

interface MenuResponse {
  source: 'esb' | 'sajian_native';
  visitPurpose?: string;
  menu: { menuCategories: ESBMenuCategory[] };
}

export interface UseMenuData {
  sections: MenuSection[];
  loading: boolean;
  error: string | null;
  orderType: OrderType | null;
  setOrderType: (v: OrderType) => void;
  branchCode: string | null;
  // True while we're still figuring out which branch to use
  // (auto-pick API call in flight). MenuView shows a spinner instead
  // of the "pilih cabang" gate during this window.
  resolvingBranch: boolean;
  // Total active branches. When > 1 and no branchCode yet, MenuView
  // surfaces the picker. When = 0, "Belum ada cabang aktif".
  branchCount: number | null;
  onAdd: (item: ESBMenuItem) => void;
}

export function useMenuData(tenant: PublicTenant): UseMenuData {
  const branchCode = useCart((s) => s.branchCode);
  const orderType = useCart((s) => s.orderType);
  const setOrderType = useCart((s) => s.setOrderType);
  const setBranch = useCart((s) => s.setBranch);
  const addItem = useCart((s) => s.addItem);

  const [menu, setMenu] = useState<MenuResponse['menu'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchCount, setBranchCount] = useState<number | null>(null);
  const [resolvingBranch, setResolvingBranch] = useState(true);

  useEffect(() => {
    if (!orderType) setOrderType('takeaway');
  }, [orderType, setOrderType]);

  // Auto-resolve branch on /menu so single-branch tenants don't get
  // gated behind a "Pilih cabang dulu" wall. Calls /api/branches with
  // no lat/lng (returns the full active list). When exactly one
  // branch is active we pin it into the cart store immediately.
  useEffect(() => {
    if (branchCode) {
      setResolvingBranch(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/branches', { cache: 'no-store' });
        const body = await res.json();
        const list = (body?.branches ?? []) as Array<{ code: string; name: string }>;
        if (cancelled) return;
        setBranchCount(list.length);
        if (list.length === 1) setBranch(list[0].code);
      } catch (err) {
        if (!cancelled) console.error('[useMenuData] auto-pick branch failed', err);
      } finally {
        if (!cancelled) setResolvingBranch(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchCode, setBranch]);

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

  const sections = useMemo<MenuSection[]>(() => {
    if (!menu?.menuCategories) return [];
    const out: MenuSection[] = [];
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

  const onAdd = (item: ESBMenuItem) => {
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
    );
  };

  return {
    sections,
    loading,
    error,
    orderType: orderType ?? null,
    setOrderType,
    branchCode: branchCode ?? null,
    resolvingBranch,
    branchCount,
    onAdd,
  };
}
