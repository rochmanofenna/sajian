// Xendit payment gateway wrapper.
//
// Supports two flows we need for launch:
//   • QRIS (dynamic QR) — customer scans with any ID bank app, pays in-app.
//   • E-wallet Charge — redirect/deeplink to DANA, OVO, GoPay, ShopeePay,
//     LinkAja. Xendit returns a checkout URL we send the customer to.
//
// Auth is HTTP Basic with the secret key as username (password empty).
// Callbacks are verified via the `x-callback-token` header that Xendit
// sends on each webhook — see verifyCallbackToken().
//
// Env:
//   XENDIT_SECRET_KEY      xnd_development_... or xnd_production_...
//   XENDIT_CALLBACK_TOKEN  token from Xendit Dashboard → Settings → Callbacks

const BASE = 'https://api.xendit.co';

export type EWalletChannel = 'ID_DANA' | 'ID_OVO' | 'ID_SHOPEEPAY' | 'ID_LINKAJA';

export interface XenditQRIS {
  id: string;
  reference_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  qr_string: string;
  amount: number;
  currency: 'IDR';
  expires_at: string;
  created: string;
  updated: string;
}

export interface XenditEWalletCharge {
  id: string;
  reference_id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'VOIDED' | 'REFUNDED';
  currency: 'IDR';
  charge_amount: number;
  channel_code: EWalletChannel;
  actions: {
    desktop_web_checkout_url?: string;
    mobile_web_checkout_url?: string;
    mobile_deeplink_checkout_url?: string;
    qr_checkout_string?: string;
  };
}

function secretKey(): string {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) {
    throw new Error('XENDIT_SECRET_KEY is not configured');
  }
  return key;
}

function authHeader(): string {
  const token = Buffer.from(`${secretKey()}:`).toString('base64');
  return `Basic ${token}`;
}

export function verifyCallbackToken(token: string | null | undefined): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN;
  if (!expected) {
    // Fail closed if the env is missing — never accept "any token" in prod.
    return false;
  }
  return token === expected;
}

async function xenditFetch<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json()) as T & { message?: string; error_code?: string };
  if (!res.ok) {
    const msg =
      (body as { message?: string }).message ??
      (body as { error_code?: string }).error_code ??
      `Xendit ${path} failed with ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

export async function createQRIS(params: {
  referenceId: string;
  amount: number;
  // Optional ISO string. Xendit QRIS max is 48h from now.
  expiresAt?: string;
}): Promise<XenditQRIS> {
  return xenditFetch<XenditQRIS>('/qr_codes', {
    method: 'POST',
    headers: { 'api-version': '2022-07-31' },
    body: JSON.stringify({
      reference_id: params.referenceId,
      type: 'DYNAMIC',
      currency: 'IDR',
      amount: params.amount,
      expires_at: params.expiresAt,
    }),
  });
}

export async function getQRIS(qrCodeId: string): Promise<XenditQRIS> {
  return xenditFetch<XenditQRIS>(`/qr_codes/${qrCodeId}`, {
    method: 'GET',
    headers: { 'api-version': '2022-07-31' },
  });
}

export async function createEWalletCharge(params: {
  referenceId: string;
  amount: number;
  channelCode: EWalletChannel;
  customerName: string;
  customerPhone: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
}): Promise<XenditEWalletCharge> {
  // OVO requires tokenized flow; we use the direct-debit path via
  // ONE_TIME_PAYMENT for DANA/ShopeePay/LinkAja. OVO falls back to the
  // redirect URL too, but a mobile number is mandatory for all of them.
  return xenditFetch<XenditEWalletCharge>('/ewallets/charges', {
    method: 'POST',
    body: JSON.stringify({
      reference_id: params.referenceId,
      currency: 'IDR',
      amount: params.amount,
      checkout_method: 'ONE_TIME_PAYMENT',
      channel_code: params.channelCode,
      channel_properties: {
        success_redirect_url: params.successRedirectUrl,
        failure_redirect_url: params.failureRedirectUrl,
      },
      customer: {
        given_names: params.customerName || 'Customer',
        mobile_number: normalizePhone(params.customerPhone),
      },
    }),
  });
}

export async function getEWalletCharge(id: string): Promise<XenditEWalletCharge> {
  return xenditFetch<XenditEWalletCharge>(`/ewallets/charges/${id}`, { method: 'GET' });
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `+${digits}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function channelFor(method: 'dana' | 'ovo' | 'gopay' | 'shopeepay'): EWalletChannel {
  switch (method) {
    case 'dana':
      return 'ID_DANA';
    case 'ovo':
      return 'ID_OVO';
    case 'gopay':
      // GoPay lives under the "e-wallet" umbrella via LinkAja-like flow.
      // Xendit currently doesn't expose ID_GOPAY — merchants use ShopeePay/DANA.
      // We'll accept 'gopay' at the schema layer and map to ShopeePay (close
      // neighbor) OR surface an error — choose error to avoid silent mismatch.
      throw new Error('GoPay belum tersedia — gunakan QRIS, DANA, atau ShopeePay.');
    case 'shopeepay':
      return 'ID_SHOPEEPAY';
    default:
      throw new Error(`Unknown e-wallet method: ${method}`);
  }
}

export function checkoutUrl(charge: XenditEWalletCharge): string | null {
  return (
    charge.actions.mobile_deeplink_checkout_url ??
    charge.actions.mobile_web_checkout_url ??
    charge.actions.desktop_web_checkout_url ??
    null
  );
}
