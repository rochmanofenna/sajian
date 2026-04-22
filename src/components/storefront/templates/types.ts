// Shared types for storefront template variants.
//
// Each template exposes a Home (landing) and Menu (the /menu page) component.
// Data-fetching + cart wiring live in the shared hook `useMenuData`; variants
// just receive the flattened sections and decide layout.

import type { PublicTenant } from '@/lib/tenant';
import type { OrderType } from '@/lib/cart/store';
import type { ESBMenuItem } from '@/lib/esb/types';

export interface MenuSection {
  categoryName: string;
  subName: string;
  key: string;
  items: ESBMenuItem[];
}

export interface HomeVariantProps {
  tenant: PublicTenant;
}

export interface MenuVariantProps {
  tenant: PublicTenant;
  sections: MenuSection[];
  loading: boolean;
  error: string | null;
  orderType: OrderType | null;
  setOrderType: (v: OrderType) => void;
  onAdd: (item: ESBMenuItem) => void;
}

export function itemPrice(item: ESBMenuItem): number {
  return item.sellPrice ?? item.price ?? item.originalSellPrice ?? item.originalPrice ?? 0;
}

export function itemImage(item: ESBMenuItem): string | undefined {
  return item.imageOptimUrl ?? item.imageUrl ?? item.imageThumbnailUrl;
}

export const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
];
