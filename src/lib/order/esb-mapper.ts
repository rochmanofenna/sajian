// Translate Sajian cart shape → ESB /qsv1/order/qrData payload.
// Field shape from ~/mindiology/kamarasan-app/app/cart.tsx:516-535 (cashier path).

import type { SubmitOrderRequest } from './schema';

const ORDER_TYPE_MAP = {
  dine_in: 'dineIn',
  takeaway: 'takeAway',
  delivery: 'delivery',
} as const;

export function toESBCashierPayload(
  req: SubmitOrderRequest,
  visitPurposeID: string,
  branchLat: number,
  branchLng: number,
) {
  const now = Date.now();
  const phone62 = req.customerPhone.replace(/^\+?/, '').replace(/^0/, '62');

  const salesMenus = req.items.map((item, idx) => ({
    // ESB expects ID to be unique per line; timestamp + idx keeps it so.
    ID: now + idx,
    menuID: Number(item.esbMenuId ?? item.menuItemId),
    qty: item.quantity,
    // Phase 1 doesn't send modifier/extras back to ESB — we only record them
    // locally. ESB's menu detail call returns the available modifier IDs we'd
    // need to echo; wiring that is Phase 2 menu-sync work.
    extras: [],
    packages: [],
    notes: item.notes ?? '',
    promotionDetailID: 0,
    promotionVoucherCode: null,
    rewardType: 'voucher',
  }));

  return {
    orderType: ORDER_TYPE_MAP[req.orderType],
    orderTypeName: null,
    visitPurposeID,
    fullName: req.customerName,
    email: '',
    phoneNumber: phone62,
    deliveryAddress: req.orderType === 'delivery' ? req.deliveryAddress ?? '' : '',
    deliveryAddressInfo: '',
    latitude: branchLat,
    longitude: branchLng,
    memberID: '',
    salesMenus,
    tableName: req.orderType === 'dine_in' ? req.tableNumber ?? null : null,
    scheduledAt: null,
    deliveryCourierID: 0,
    userToken: '',
  };
}
