// ESB payment/order status → Sajian canonical state.
// Lifted from ~/mindiology/kamarasan-app/server/samples/ESB_STATUS_MAP.md.

export type SajianPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
export type SajianOrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'paid_but_not_pushed';

export function mapPaymentStatus(esbStatus: string | undefined, flagPushToPOS: boolean | null | undefined): SajianPaymentStatus {
  if (!esbStatus) return 'pending';
  switch (esbStatus.toLowerCase()) {
    case 'settlement':
      return 'paid';
    case 'pending':
      return 'pending';
    case 'expired':
      return 'expired';
    case 'closed':
      return flagPushToPOS === false ? 'failed' : 'expired';
    default:
      return 'pending';
  }
}

// When status=settlement + flagPushToPOS=true, order is in the kitchen.
// When status=settlement + flagPushToPOS=false for >30s → paid_but_not_pushed
// recovery state (show customer a WA contact for the branch).
export function mapOrderStatus(esbStatus: string | undefined, flagPushToPOS: boolean | null | undefined, secondsSinceSettlement = 0): SajianOrderStatus {
  const s = (esbStatus || '').toLowerCase();
  if (s === 'settlement') {
    if (flagPushToPOS === true) return 'confirmed';
    if (flagPushToPOS === false && secondsSinceSettlement > 30) return 'paid_but_not_pushed';
    return 'confirmed';
  }
  if (s === 'closed' || s === 'expired') return 'cancelled';
  return 'new';
}
