// ESB API client — ported from ~/mindiology/kamarasan-app/server/index.ts
// (authoritative source; spec endpoint mapping was wrong in multiple places).
//
// Every request carries:
//   Authorization: Bearer <static token OR per-user authkey>
//   Data-Company:  <MBLA etc.>
//   Data-Branch:   <MCE etc.> (when scoped)
//
// Menu + order endpoints hit `ESB_BASE` (per-env). Auth/membership endpoints hit
// `ESB_AUTH_BASE` (always production — staging doesn't support /customer/*).
//
// Errors surface as `ESBError` with ESB's raw message; API routes sanitize them
// before shipping to the browser.

import type { Tenant } from '@/lib/tenant';
import type {
  ESBBranchSettings,
  ESBMenuResponse,
  ESBCalculatedTotal,
  ESBSubmitOrderResponse,
  ESBValidatePaymentResponse,
} from './types';

const ESB_BASE_BY_ENV = {
  staging: 'https://stg7.esb.co.id/api-ezo/web',
  production: 'https://eso-api.esb.co.id',
} as const;

const ESB_AUTH_BASE = 'https://eso-api.esb.co.id';

// 30s matches the existing middleware. Longer than most ESB responses,
// shorter than Vercel's function timeout.
const DEFAULT_TIMEOUT_MS = 30_000;

export class ESBError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ESBError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  branch?: string;
  // Use ESB_AUTH_BASE instead of ESB_BASE (auth/membership endpoints)
  useAuthBase?: boolean;
  // Override bearer (user authkey for /api/user/* endpoints)
  userToken?: string;
  timeoutMs?: number;
}

export class ESBClient {
  readonly companyCode: string;
  readonly defaultBranch: string;
  private readonly token: string;
  private readonly base: string;

  constructor(tenant: Tenant) {
    if (tenant.pos_provider !== 'esb' || !tenant.pos_config) {
      throw new Error(`Tenant ${tenant.slug} is not ESB-backed (pos_provider=${tenant.pos_provider})`);
    }
    const cfg = tenant.pos_config;
    const env = (cfg.esb_environment === 'staging' ? 'staging' : 'production') as 'staging' | 'production';

    this.base = ESB_BASE_BY_ENV[env];
    this.token = cfg.esb_bearer_token ?? '';
    this.companyCode = cfg.esb_company_code ?? '';
    this.defaultBranch = cfg.esb_default_branch ?? '';

    if (!this.token) throw new Error(`Tenant ${tenant.slug} missing esb_bearer_token`);
    if (!this.companyCode) throw new Error(`Tenant ${tenant.slug} missing esb_company_code`);
  }

  private async request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
    const method = opts.method ?? 'GET';
    const base = opts.useAuthBase ? ESB_AUTH_BASE : this.base;
    const url = `${base}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.userToken ?? this.token}`,
      'Data-Company': this.companyCode,
    };
    if (opts.branch) headers['Data-Branch'] = opts.branch;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new ESBError(504, 'ESB tidak merespons. Silakan coba lagi.', path);
      }
      throw new ESBError(500, 'Gagal menghubungi ESB.', path, err);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const obj = (data ?? {}) as { message?: string; error?: string };
      const msg = obj.message || obj.error || `ESB ${res.status} at ${path}`;
      throw new ESBError(res.status, msg, path, data);
    }

    return data as T;
  }

  // ─── Branches ──────────────────────────────────────────

  // GET /qsv1/branch/{lat}/{lng} — distance-sorted branch list for the tenant.
  async getBranches(lat: number | string, lng: number | string) {
    return this.request(`/qsv1/branch/${lat}/${lng}`);
  }

  // POST /qsv1/setting/branch — per-branch config (orderModes, payment, hours, tax).
  // Source this to discover visitPurposeID for each order type.
  async getBranchSettings(branch: string) {
    return this.request<ESBBranchSettings | { data?: ESBBranchSettings }>('/qsv1/setting/branch', {
      method: 'POST',
      branch,
      body: {},
    });
  }

  // ─── Menu ──────────────────────────────────────────────

  // GET /qsv1/menu/{visitPurpose} — menu for a (branch, visitPurpose) pair.
  // Optional memberCode applies member-only pricing.
  async getMenu(branch: string, visitPurpose: string | number, memberCode?: string) {
    const path = memberCode
      ? `/qsv1/menu/${visitPurpose}?memberCode=${encodeURIComponent(memberCode)}`
      : `/qsv1/menu/${visitPurpose}`;
    return this.request<ESBMenuResponse | { data?: ESBMenuResponse }>(path, { branch });
  }

  // GET /qsv1/menu/detail/{visitPurpose}/{menuId} — variants, modifiers, full description.
  async getMenuDetail(branch: string, visitPurpose: string | number, menuId: string) {
    return this.request(`/qsv1/menu/detail/${visitPurpose}/${encodeURIComponent(menuId)}`, { branch });
  }

  // ─── Order flow ────────────────────────────────────────

  // Call BEFORE calculate-total to fail fast when the branch is offline.
  async checkItems(branch: string, body: Record<string, unknown>) {
    return this.request('/qsv1/order/check-items', { method: 'POST', branch, body });
  }

  // Computes grandTotal + roundingTotal. The submit step must send
  // (grandTotal - roundingTotal) as the charged amount — ESB's longest-standing
  // integration quirk. Documented in docs/ESB_API_REFERENCE.md of the source repo.
  async calculateTotal(branch: string, body: Record<string, unknown>) {
    return this.request<ESBCalculatedTotal | { data?: ESBCalculatedTotal }>('/qsv1/order/calculate-total', {
      method: 'POST',
      branch,
      body,
    });
  }

  // POST /qsv1/order — online payment flow (returns orderID + qrString|redirectUrl).
  async submitOrder(branch: string, body: Record<string, unknown>) {
    return this.request<ESBSubmitOrderResponse | { data?: ESBSubmitOrderResponse }>('/qsv1/order', {
      method: 'POST',
      branch,
      body,
    });
  }

  // POST /qsv1/order/qrData — Bayar di Kasir. Returns a base64 qrData the
  // customer shows the cashier. No paymentMethodID, no calculate-total.
  async submitCashierOrder(branch: string, body: Record<string, unknown>) {
    return this.request('/qsv1/order/qrData', { method: 'POST', branch, body });
  }

  // GET /qsv1/order/{orderID} — post-submit order detail (items, branch, status).
  async getOrder(branch: string, orderId: string) {
    return this.request(`/qsv1/order/${encodeURIComponent(orderId)}`, { branch });
  }

  // GET /qsv1/payment/validate/{orderID} — poll every 3–4s after order submit.
  async validatePayment(branch: string, orderId: string) {
    return this.request<ESBValidatePaymentResponse | { data?: ESBValidatePaymentResponse }>(
      `/qsv1/payment/validate/${encodeURIComponent(orderId)}`,
      { branch },
    );
  }

  // ─── Membership ────────────────────────────────────────

  async checkMembership(branch: string, phoneNumber: string, countryCode = '+62') {
    return this.request('/qsv1/membership/check-member-status', {
      method: 'POST',
      branch,
      body: { phoneNumber, countryCode },
      useAuthBase: true,
    });
  }

  async lookupMember(branch: string, key: string) {
    return this.request('/qsv1/membership', {
      method: 'POST',
      branch,
      body: { key },
    });
  }

  async getVouchers(branch: string, memberCode: string) {
    return this.request(
      `/qsv1/membership/voucher-list?memberCode=${encodeURIComponent(memberCode)}`,
      { branch },
    );
  }

  // ─── Promotions ────────────────────────────────────────

  async listPromotions(branch: string, visitPurposeID: string | number, scheduledAt?: string) {
    return this.request('/qsv1/promotion', {
      method: 'POST',
      branch,
      body: scheduledAt ? { visitPurposeID, scheduledAt } : { visitPurposeID },
    });
  }

  async validatePromotionPayment(branch: string, body: Record<string, unknown>) {
    return this.request('/qsv1/promotion/validate-payment', { method: 'POST', branch, body });
  }

  // ─── WhatsApp OTP auth ─────────────────────────────────

  async sendWhatsAppOTP(branch: string | undefined, appName: string, scheme: string) {
    return this.request('/customer/whatsapp/generate-otp', {
      method: 'POST',
      useAuthBase: true,
      branch,
      body: {
        requestText: `Hai! Saya ingin login ke ${appName} dengan kode verifikasi:`,
        responseText: 'Verifikasi berhasil! Klik link di bawah ini untuk melanjutkan pesanan kamu 🤩\n\n{{redirectUrl}}',
        redirectUrl: `${scheme}://auth/callback`,
      },
    });
  }

  async verifyOTP(otp: string) {
    return this.request('/customer/whatsapp/get-status-otp', {
      method: 'POST',
      useAuthBase: true,
      body: { otp, appID: 'esoqs' },
    });
  }
}

// Helper: take a raw branch-settings payload (ESB sometimes wraps it in `data`)
// and return the visitPurposeID for a given Sajian order type.
export function visitPurposeFor(
  settings: ESBBranchSettings | { data?: ESBBranchSettings } | null | undefined,
  orderType: 'dine_in' | 'takeaway' | 'delivery',
): string | null {
  if (!settings) return null;
  const unwrapped = 'data' in settings && settings.data ? settings.data : (settings as ESBBranchSettings);
  const modes = unwrapped.orderModes ?? [];
  const typeMap = { dine_in: 'dineIn', takeaway: 'takeAway', delivery: 'delivery' } as const;
  const target = typeMap[orderType];
  const mode = modes.find(m => m.type === target);
  return mode?.visitPurposeID ?? null;
}
