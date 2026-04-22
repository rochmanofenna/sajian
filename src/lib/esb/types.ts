// ESB response shapes we actually consume. Kept minimal — most of ESB's payload
// is passed through to the client. Types tighten as we hit real payloads.

export type ESBOrderModeType = 'dineIn' | 'takeAway' | 'delivery';

export interface ESBOrderMode {
  type: ESBOrderModeType;
  visitPurposeID: string;
  flagShowESBOrder: boolean;
  deliveryCourier?: string;
  deliveryCostTemplate?: string;
  forms: unknown[];
}

export interface ESBBranchSettings {
  companyCode: string;
  branchCode: string;
  branchName: string;
  address?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  taxName?: string;
  taxValue?: number;
  additionalTaxName?: string;
  additionalTaxValue?: number;
  isOpen?: boolean;
  isTemporaryClosed?: boolean;
  orderModes: ESBOrderMode[];
  payment?: {
    atCashier?: boolean;
    online?: Array<{ id: string; name: string; nameId?: string }>;
  };
}

// Shape confirmed against live /qsv1/menu response for MBLA/MCE. ESB nests
// items two levels deep: menuCategories → menuCategoryDetails → menus.
export interface ESBMenuItem {
  menuID: number;
  menuName: string;
  menuShortName?: string;
  menuCode?: string;
  // `price` is the active price; `sellPrice` mirrors it in most payloads.
  // `originalPrice` is pre-discount.
  price: number;
  sellPrice?: number;
  originalSellPrice?: number;
  originalPrice?: number;
  imageUrl?: string;
  imageOptimUrl?: string;
  imageThumbnailUrl?: string;
  description?: string;
  flagSoldOut?: boolean;
  flagRecommendation?: number;
  qty?: number;
  orderID?: number;
}

export interface ESBMenuCategoryDetail {
  menuCategoryDetailID: number;
  menuCategoryDetailCode?: string;
  menuCategoryDetailDesc: string;
  imageUrl?: string | null;
  description?: string;
  flagSoldOut?: boolean;
  orderID?: string;
  menus: ESBMenuItem[];
}

export interface ESBMenuCategory {
  menuCategoryID: number;
  menuCategoryCode?: string;
  menuCategoryDesc: string;
  imageUrl?: string;
  description?: string;
  flagSoldOut?: boolean;
  orderID?: string;
  menuCategoryDetails: ESBMenuCategoryDetail[];
}

export interface ESBMenuResponse {
  rangeMenuPrice?: { labelAveragePrice: string; averagePrice: number; currencySign: string };
  menuCategories: ESBMenuCategory[];
  menuRecommendations?: unknown;
  menuPromotionMembership?: unknown;
  maxOrder?: number;
}

export interface ESBCalculatedTotal {
  // The two values the submit step needs — ESB returns many more.
  grandTotal: number;
  roundingTotal: number;
  // Whatever else ESB returned (taxes, discounts, promo breakdown) — passed through.
  [key: string]: unknown;
}

export interface ESBSubmitOrderResponse {
  orderID: string;
  qrString?: string;
  redirectUrl?: string;
  paymentTotal?: number;
  timeRemaining?: number;
  [key: string]: unknown;
}

export interface ESBValidatePaymentResponse {
  status: 'pending' | 'settlement' | 'expired' | 'closed' | string;
  flagPushToPOS?: boolean | null;
  paymentTotal?: number;
  timeRemaining?: number;
  qrString?: string;
  errorMessage?: string | null;
  [key: string]: unknown;
}
