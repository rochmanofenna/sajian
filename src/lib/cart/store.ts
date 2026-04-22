// Cart state. Zustand + localStorage persist.
//
// The cart is single-tenant. If you add an item from tenant B while items from
// tenant A are in the cart, we wipe first — the explicit tenantSlug arg
// (spec correction: don't infer from menuItemId prefixes) makes this robust
// even when menu IDs happen to collide across tenants.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentMethod = 'dana' | 'qris' | 'ovo' | 'gopay' | 'cashier';

export interface CartModifier {
  groupName: string;
  optionLabel: string;
  priceDelta: number;
}

export interface CartItem {
  // client-generated, stable for the cart entry — not the menu_item_id
  lineId: string;
  // Sajian menu_items.id (uuid) for sajian_native, esb_menu_id for ESB tenants
  menuItemId: string;
  // ESB tenants only: the menuID from /qsv1/menu (passes through to submit)
  esbMenuId?: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: CartModifier[];
  notes?: string;
  imageUrl?: string;
}

interface CartState {
  tenantSlug: string | null;
  branchCode: string | null;
  orderType: OrderType | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  items: CartItem[];

  addItem: (item: Omit<CartItem, 'lineId'>, tenantSlug: string) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  setBranch: (code: string) => void;
  setOrderType: (t: OrderType) => void;
  setTableNumber: (n: string | null) => void;
  setDeliveryAddress: (a: string | null) => void;
  clear: () => void;
  // Call from the tenant provider on mount: wipes the persisted cart if it
  // was left behind from a different subdomain. Prevents the customer from
  // carrying tenant A's items into tenant B's checkout after navigating
  // directly across subdomains.
  ensureTenantScope: (currentSlug: string) => void;

  getSubtotal: () => number;
  getItemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      tenantSlug: null,
      branchCode: null,
      orderType: null,
      tableNumber: null,
      deliveryAddress: null,
      items: [],

      addItem: (item, tenantSlug) => {
        const state = get();
        // Only wipe when switching between two known tenants. A null→slug
        // transition means "first add to a fresh cart" — the branch/orderType
        // the user picked on the landing page must survive.
        const tenantChanged =
          state.tenantSlug != null && state.tenantSlug !== tenantSlug;

        const newItem: CartItem = { ...item, lineId: nanoid() };
        set({
          tenantSlug,
          branchCode: tenantChanged ? null : state.branchCode,
          orderType: tenantChanged ? null : state.orderType,
          items: tenantChanged ? [newItem] : [...state.items, newItem],
        });
      },

      removeItem: (lineId) =>
        set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),

      updateQuantity: (lineId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.lineId !== lineId)
              : state.items.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)),
        })),

      setBranch: (code) => set({ branchCode: code }),
      setOrderType: (t) => set({ orderType: t }),
      setTableNumber: (n) => set({ tableNumber: n }),
      setDeliveryAddress: (a) => set({ deliveryAddress: a }),
      clear: () =>
        set({
          tenantSlug: null,
          branchCode: null,
          orderType: null,
          tableNumber: null,
          deliveryAddress: null,
          items: [],
        }),

      ensureTenantScope: (currentSlug) => {
        const state = get();
        if (state.tenantSlug && state.tenantSlug !== currentSlug) {
          set({
            tenantSlug: null,
            branchCode: null,
            orderType: null,
            tableNumber: null,
            deliveryAddress: null,
            items: [],
          });
        }
      },

      getSubtotal: () =>
        get().items.reduce((sum, item) => {
          const modifierTotal = item.modifiers.reduce((s, m) => s + m.priceDelta, 0);
          return sum + (item.price + modifierTotal) * item.quantity;
        }, 0),

      getItemCount: () => get().items.reduce((n, i) => n + i.quantity, 0),
    }),
    {
      name: 'sajian-cart',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? undefined! : localStorage)),
      // Don't persist action fns — zustand handles this but be explicit
      partialize: (state) => ({
        tenantSlug: state.tenantSlug,
        branchCode: state.branchCode,
        orderType: state.orderType,
        tableNumber: state.tableNumber,
        deliveryAddress: state.deliveryAddress,
        items: state.items,
      }),
    },
  ),
);
