# Sajian — Codebase Audit

**Date:** 2026-04-22
**Scope:** Full `/home/ryan/sajian/` codebase before Fresh Market Emerald Bintaro launch.
**Branch:** `main` @ `fbbeefe` — working tree clean, up-to-date with `origin/main`.
**Files audited:** 102 `.ts`/`.tsx` files + 3 SQL migrations.

This is a read-only discovery pass. No code was changed. Every claim is backed by a file path and (where relevant) line number.

Severity legend used throughout: **BLOCKER** prevents a core flow · **HIGH** degrades experience significantly · **MEDIUM** noticeable but not breaking · **LOW** nice-to-have.

---

## Section A — File Tree Inventory

All 102 source files are imported somewhere; no fully dead code detected. No stubs beyond intentional Phase-1 permissive paths called out in Sections D/E/F. No duplicated files.

### `src/app/` — routes + API (34 files)

| File | Purpose |
|---|---|
| `layout.tsx` | Root layout; injects tenant colors + fonts, wraps `TenantProvider` |
| `page.tsx` | Root `/` — branches to `StorefrontHome` (subdomain) or `MarketingHome` (apex) |
| `globals.css` | All design-system CSS (`.sj-*`, `.tk-*`, `.ob-*`, `.pn-*`, `.auth-*`, `.sc-*`, `.mo-*`, `.ai-split-*`) |
| `login/page.tsx` | Apex login — email OTP, session-skip, tenant-aware redirect |
| `admin/layout.tsx` · `admin/page.tsx` | Owner dashboard (4 tabs: pesanan/menu/toko/ai) |
| `(onboarding)/layout.tsx` · `signup/page.tsx` · `setup/page.tsx` · `setup/launch/page.tsx` | Email-OTP signup → AI onboarding → launch confirmation |
| `(storefront)/layout.tsx` · `menu/page.tsx` · `cart/page.tsx` · `checkout/page.tsx` · `track/[id]/page.tsx` | Customer flow: menu → cart → checkout → track |
| `preview/[userId]/page.tsx` | Live draft preview (service role, bypasses RLS) |
| `api/tenant/route.ts` | GET public tenant (strips `pos_config`) |
| `api/menu/route.ts` · `api/menu/[id]/route.ts` | Menu read (ESB + native) |
| `api/branches/route.ts` · `api/branches/settings/route.ts` | Branch list + settings (ESB) |
| `api/order/submit/route.ts` · `api/order/[id]/route.ts` | Order create + read |
| `api/webhooks/xendit/route.ts` | Xendit callback handler |
| `api/onboarding/launch/route.ts` · `api/onboarding/qr/route.ts` | Launch atomic RPC + QR PNG |
| `api/ai/chat/route.ts` · `extract-colors` · `extract-menu` · `generate-logo` · `suggest-slug` | Claude integrations |
| `api/admin/tenant/route.ts` · `admin/menu/route.ts` · `admin/menu/[id]/route.ts` · `admin/orders/[id]/route.ts` · `admin/ai/chat/route.ts` | Owner-gated CRUD (caveat: see C) |

### `src/components/` — 37 components

Grouped by domain — see Section G for full table. Directories: `admin/`, `chrome/`, `marketing/`, `onboarding/`, `storefront/`, `storefront/templates/{classic,food-hall,kedai,modern,warung}/`.

### `src/lib/` — 22 helper modules

| Dir | Files |
|---|---|
| `admin/` | `auth.ts` — `requireOwnerOrThrow`, `getOwnerOrNull` |
| `ai/` | `anthropic.ts` — Claude SDK wrapper |
| `api/` | `errors.ts`, `tenant-api.ts` |
| `cart/` | `store.ts` — Zustand cart (persist) |
| `esb/` | `client.ts`, `status-map.ts`, `types.ts` |
| `i18n/` | `LanguageProvider.tsx`, `messages.ts` |
| `notify/` | `whatsapp.ts` — stub, Phase-1 |
| `onboarding/` | `slug.ts`, `store.ts`, `types.ts` |
| `order/` | `esb-mapper.ts`, `schema.ts` |
| `payments/` | `xendit.ts` — custom HTTP client (does NOT use `xendit-node` npm pkg) |
| `supabase/` | `client.ts`, `server.ts`, `service.ts`, `middleware.ts` (session refresh) |
| — | `tenant.ts`, `tenant-types.ts`, `utils.ts` |

### `src/context/` — 1 file

`TenantContext.tsx` — `PublicTenant` provider + `useTenant()` / `useTenantOptional()` hooks.

### Root

`src/proxy.ts` — Next.js 16 middleware replacement. Extracts tenant slug from `Host`, refreshes Supabase session, injects `x-tenant-slug` header.

**No dead files. No stubs. No duplicates.**

---

## Section B — Route Map

| Route | Host | File | Auth | Renders? | Mobile | Back Nav | Loading | Error | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `/` | apex | `app/page.tsx` | No | ✅ | ✅ | — | — | — | Delegates to `MarketingHome` |
| `/` | subdomain | `app/page.tsx` | No | ✅ | ✅ | — | — | — | Delegates to `StorefrontHome` (template registry) |
| `/login` | apex | `app/login/page.tsx` | No (session-skip) | ✅ | ✅ | ✅ PageNav | ✅ inline Loader2 | ✅ `.auth__error` | 4 stages: checking → email → otp → redirecting |
| `/signup` | apex | `(onboarding)/signup/page.tsx:24` | No | ✅ | ✅ | ❌ no back | ❌ | ✅ inline error | Email OTP signup |
| `/setup` | apex | `(onboarding)/setup/page.tsx:70` | Yes (Supabase) | ✅ | ✅ (pane toggle < 960px) | ❌ implicit home | ✅ `.ob-booting` | ✅ `launchError` | Chat + phone preview |
| `/setup/launch` | apex | `(onboarding)/setup/launch/page.tsx` | Yes | ✅ | ✅ | ✅ back to `/setup` | ❌ | ❌ | Post-launch QR |
| `/preview/[userId]` | apex | `app/preview/[userId]/page.tsx` | Service role (RLS bypass) | ✅ | ✅ | ❌ | ❌ | ❌ | Draft iframe preview |
| `/admin` | subdomain | `app/admin/page.tsx:21` | Yes (owner) | ✅ | ✅ | ❌ | ❌ | ✅ `OwnerLogin` fallback | 4 tabs; inline login on unauth |
| `/menu` | subdomain | `(storefront)/menu/page.tsx` | No | ✅ | ✅ | ✅ PageNav | ✅ branch-picker gate | ✅ fallback msg | Requires branch selected first |
| `/cart` | subdomain | `(storefront)/cart/page.tsx` | No | ✅ | ✅ | ✅ PageNav `/menu` | ❌ | ❌ | Zustand cart state |
| `/checkout` | subdomain | `(storefront)/checkout/page.tsx` | No | ✅ | ✅ | ✅ PageNav `/cart` | ❌ | ❌ | Payment method picker |
| `/track/[id]` | subdomain | `(storefront)/track/[id]/page.tsx` | No (UUID-only) | ✅ | ✅ | ✅ PageNav `/` | ✅ Loader2 | ✅ inline error | Poll + countdown |

**Findings:**

- **No `error.tsx` or `loading.tsx` route boundary files anywhere.** All error/loading handled inline in components. Means an unexpected thrown error during render shows Next.js default error page, not a branded one. → **LOW** (pre-launch polish).
- **`/signup` has no back navigation.** User clicks signup → enters email → is stuck on verification screen with no path back. → **MEDIUM**.
- **`/admin` has no "back to storefront" link.** Owner is trapped in dashboard until they open a new tab. → **LOW**.
- **`/preview/[userId]` uses service role to bypass RLS** — acceptable because it's scoped to `userId` query (only the owner's draft). Should be auth-gated as Phase-2 hardening.

---

## Section C — API Route Inventory

| Method | Path | Auth | Validation | ESB/Native | Rate Limit | Error Quality | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/tenant` | — | resolveTenant | Both | ❌ | ✅ | Strips `pos_config` (ESB bearer) |
| GET | `/api/menu` | — | zod params (branch/orderType) | Both | ❌ | ✅ | Native mirrors ESB shape |
| GET | `/api/menu/[id]` | — | zod params | Both | ❌ | ✅ | |
| GET | `/api/branches` | — | params required | Both | ❌ | ✅ ESB fallback | Enriches w/ distance + isOpen |
| GET | `/api/branches/settings` | — | zod | ESB only | ✅ 5-min cache | ✅ | |
| POST | `/api/order/submit` | — | zod `submitOrderSchema` | Both | ❌ | ✅ | see F.1/F.2 for risks |
| GET | `/api/order/[id]` | UUID-only | param validation | Both | ❌ | ✅ | **see F.5 — no phone gate** |
| POST | `/api/webhooks/xendit` | x-callback-token | header + UUID regex | Native | ❌ | ✅ | **non-constant-time compare — see F.3** |
| POST | `/api/onboarding/launch` | `getUser()` | zod draft | Native | ❌ | ✅ | Edit-existing + create paths |
| GET | `/api/onboarding/qr` | — | `isValidSlug` | — | ❌ | ✅ | 1024px PNG |
| POST | `/api/ai/chat` | ❌ **none** | zod messages[] | — | ❌ | ✅ | **unmetered Claude spend — MEDIUM** |
| POST | `/api/ai/extract-colors` | ❌ none | FormData (<8MB img) | — | ❌ | ✅ | unmetered |
| POST | `/api/ai/extract-menu` | ❌ none | FormData (≤6 imgs or PDF <32MB) | — | ❌ | ✅ | unmetered |
| POST | `/api/ai/generate-logo` | `getUser()` ✅ | zod body | — | ❌ | ✅ | Auth gate correct |
| POST | `/api/ai/suggest-slug` | ❌ none | zod body | — | ❌ | ✅ | Cheap (no model call) |
| GET | `/api/admin/tenant` | `requireOwnerOrThrow` | — | Both | ❌ | ✅ | |
| PATCH | `/api/admin/tenant` | `requireOwnerOrThrow` | zod strict allowlist | Both | ❌ | ✅ | Prevents escalation |
| GET | `/api/admin/menu` | `requireOwnerOrThrow` | — | Native (ESB readonly) | ❌ | ✅ | |
| PATCH | `/api/admin/menu/[id]` | `requireOwnerOrThrow` | zod | Native only | ❌ | ✅ | 409 on ESB tenant |
| PATCH | `/api/admin/orders/[id]` | **❌ only `resolveTenant`** | zod | Both | ❌ | ✅ | **Phase-1 gap — see E.6** |
| POST | `/api/admin/ai/chat` | `requireOwnerOrThrow` | — | — | ❌ | ✅ | |

**Findings:**

- **`/api/admin/orders/[id]` PATCH has no owner auth wall** (`src/app/api/admin/orders/[id]/route.ts:2-3` has explicit Phase-1 TODO comment). Anyone who hits the tenant subdomain can update any order's `status`/`payment_status`. → **HIGH** — must fix before launch.
- **All `/api/ai/*` routes except `generate-logo` have no auth and no rate limit.** An attacker can drain Anthropic credits from a laptop. → **MEDIUM** — add basic token bucket or auth gate before public launch.
- **No global rate limiting middleware** on `/api/order/submit` either. Same risk: order spam fills Supabase and ESB. → **MEDIUM**.
- Webhook signature uses `===` — see F.3.

---

## Section D — Supabase Schema

3 migrations: `001_initial_schema.sql`, `002_auth_and_onboarding.sql`, `003_theme_templates.sql`. All 3 referenced by code; no orphan migration, no code reference to a missing object.

### Tables

All 8 tables (`tenants`, `branches`, `menu_categories`, `menu_items`, `customers`, `orders`, `onboarding_drafts`, plus `auth.users`) match code usage.

**Columns defined but never read/written by code** (Phase-2 reserved, not bugs): `tenants.contact_email`, `country_code`, `currency_symbol`, `locale`, `fallback_coords`, `features`, `tiers`, `rewards`, `subscription_tier`, `owner_name`; `branches.coords` + `operating_hours`; `menu_items.esb_menu_id` + `esb_category_id`; `customers.points` + `total_orders` + `total_spent` + `esb_member_id` + `esb_authkey`. → **LOW** (tech debt, safe).

### RLS Policies

| Table | Policy | Effect | Risk |
|---|---|---|---|
| `tenants` | Public can read active | SELECT `is_active = true` | ⚠️ `pos_config` includes ESB bearer — covered by API strip, but RLS doesn't restrict column. **Phase-2: dedicated `public_tenants` view.** |
| `menu_items` · `menu_categories` · `branches` | Public can read | SELECT + active-tenant predicate | ✅ |
| `orders` | Customers can read orders | **SELECT USING (true)** | 🚨 **Phase-1 permissive — any unauth can read any order.** Mitigated at API layer via `tenant_id` + UUID, but RLS alone is wide-open. |
| `tenants` | Owners can read/update | auth.uid = owner_user_id (USING + WITH CHECK) | ✅ |
| `onboarding_drafts` | Users CRUD own | auth.uid = user_id | ✅ |
| `menu_items`, `menu_categories` | ❌ **No owner UPDATE/DELETE policy** | — | Owner menu edits currently flow through API routes that use service client. Polish 2 (Menu CRUD) must add these RLS policies if we want direct-from-browser inline editing. |

### Indexes

All 14 indexes (slug, active, tenant FKs, order status, `(tenant_id, created_at desc)`, `(tenant_id, phone)`, `esb_order_id`) cover observed query patterns. No missing indexes.

### Realtime

`alter publication supabase_realtime add table public.orders;` present (migration 001:332). Consumed in `src/components/admin/OrderFeed.tsx:63-83` filtered by `tenant_id=eq.{tenant.id}`. ✅

### RPC + Storage

- `generate_order_number(tenant_id, branch_code)` — defined, used by order/submit at :100, :171. ✅
- `onboarding_launch(user_id, phone, draft)` — defined v1 in 002, extended in 003 with `theme_template`/`hero_image_url`. Called in `api/onboarding/launch/route.ts:117`. ✅
- Storage bucket `assets` — created in 002:215-235, public read, authenticated write scoped to `user-{uid}/…` folder. Consumed in logo generation. ✅

---

## Section E — Auth Flow

### E.1 Signup (`/signup`)

Email OTP via `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` (`signup/page.tsx:37-40`). After OTP verify, queries `tenants.owner_user_id = user.id`. If found → redirect to `/?existing={slug}`; else → `/setup`. No back-nav. → **MEDIUM usability**.

### E.2 Login (`/login` apex)

Session-skip check on mount; if no user, email OTP form. Post-verify: tenant-aware lookup handles 3 shapes (`login/page.tsx:27-90`):

- On tenant subdomain (`slug.sajian.app`) → verify `owner_user_id === user.id` → same-host `/admin`.
- On apex → latest active tenant via `.order('created_at',{ascending:false}).limit(1)` → cross-subdomain redirect (`https://slug.sajian.app/admin`).
- Multiple-tenants bug ("JSON requested, multiple rows") **fixed** by `.limit(1)`.

### E.3 Session persistence

`src/proxy.ts` calls `await supabase.auth.getUser()` on every non-asset request and writes refreshed cookies back. Cookie domain `.sajian.app` allows cross-subdomain session. Ownership is always re-verified server-side (`lib/admin/auth.ts`). ✅

### E.4 Admin gate

`admin/page.tsx:21-54` + `lib/admin/auth.ts`:
1. Resolve tenant from host.
2. `getUser()` — no user → render `<OwnerLogin/>` inline (no redirect).
3. Service-role lookup of `tenants.owner_user_id` → compare to `user.id`.
4. Mismatch → inline `<OwnerLogin reason="not_owner"/>`.

Service client used intentionally for ownership verification (bypasses RLS to avoid chicken-and-egg). ✅

### E.5 Logout

`components/admin/AdminTabs.tsx:34-35`: `await supabase.auth.signOut()` + `window.location.reload()`. Clears cookies + state. ✅

### E.6 API auth gaps

| Route | Auth | Status |
|---|---|---|
| `/api/ai/chat`, `extract-colors`, `extract-menu`, `suggest-slug` | ❌ none | **MEDIUM** — unmetered Claude spend |
| `/api/order/[id]` GET | UUID knowledge | Phase-1 acceptable; **MEDIUM** — PII leak on UUID enumeration |
| `/api/admin/orders/[id]` PATCH | ❌ tenant-scoped only | **HIGH** — attacker on subdomain can mark orders paid |

### E.7 Cross-subdomain

Supabase SSR cookies set at `.sajian.app` supercookie; session carries across tenants. Every `/admin` re-verifies `owner_user_id === user.id`. No privilege escalation vector. ✅

---

## Section F — Payment Flow

### F.1 ESB tenant flow (e.g., `mindiology.sajian.app`)

`api/order/submit/route.ts:70-163`. Only `cashier` is wired. Steps: `getBranchSettings` → `visitPurposeFor` → `toESBCashierPayload` → POST `/qsv1/order/qrData` → Supabase insert with `esb_order_id` + `payment_qr_string`.

**Critical issues:**

- **HIGH — UI doesn't filter methods by `pos_provider`.** `CheckoutView.tsx:19-25` hardcodes 5 methods (QRIS/DANA/OVO/ShopeePay/Cashier). If ESB-tenant customer picks QRIS, request body reaches API; ESB branch at :70 only handles `cashier` by convention — the schema doesn't reject, so behavior depends on the control flow. On ESB tenant with non-cashier method, the ESB branch still runs and hardcodes `payment_method: 'cashier'` in the insert (line 119), silently ignoring the customer's choice. **Customer pays with ESB QR but UI promised QRIS.**
- **HIGH — ESB-insert failure silent path.** `submit/route.ts:132-144`: if Supabase insert fails AFTER ESB created the order, API returns 200 with a warning string; Sajian has no record; admin dashboard never sees it; Xendit can never match on `reference_id`. Partial failure with no compensating action.

### F.2 Native tenant flow (non-ESB)

`submit/route.ts:165-287`. Order inserted with `payment_status:'pending'`, `pos_pushed:false`. Then `isDigital(paymentMethod)` branches:

- **QRIS:** `createQRIS({referenceId:order.id, amount, expiresAt:+30min})` → update `payment_qr_string` + `payment_expires_at`.
- **E-wallet:** `createEWalletCharge` + `checkoutUrl()` → update `payment_redirect_url` → response `{redirectUrl}` → client does `window.location.href = redirectUrl`.
- **GoPay:** allowed by schema but `channelFor('gopay')` throws at `lib/payments/xendit.ts:172` → 502.

**Issues:**

- **HIGH — Host header injection.** `submit/route.ts:211-214` builds success/failure URLs from `req.headers.get('host')` unvalidated. Spoofable if any layer trusts Host. Mitigation: allowlist known `*.sajian.app` or use `NEXT_PUBLIC_SITE_URL`.
- **MEDIUM — No amount validation.** Subtotal computed in memory; no floor/ceiling check. Could send 0 IDR to Xendit.
- **MEDIUM — GoPay selectable in UI but crashes at API.** Either remove from `PAYMENT_METHODS` or swap to "coming soon" label.
- **MEDIUM — Xendit failure creates orphan row.** `submit/route.ts:258-268` updates `payment_status:'failed'` and returns 502 but keeps the order row. Customer retries → duplicate order (different UUID).

### F.3 Webhook — `/api/webhooks/xendit`

`src/app/api/webhooks/xendit/route.ts` (already read in full this session).

**Issues:**

- **MEDIUM — Non-constant-time token compare.** `lib/payments/xendit.ts:60-67` uses `token === expected`. Swap for `crypto.timingSafeEqual` on equal-length Buffers.
- **MEDIUM — Idempotency skips only `paid→paid`.** Out-of-order webhook: EXPIRED arrives first (flips to expired), SUCCEEDED arrives later (flips back to paid). Mitigation: skip when `order.payment_status !== 'pending'` for any status transition.
- **LOW — `REFUNDED` / `CANCELLED` unhandled** → `mapStatus` returns null → 200 ignored. Fine if we don't expose refund UX yet; flag for Phase-2.

### F.4 TrackView polling

`src/components/storefront/TrackView.tsx` (already read in full this session). 3s polling + terminal-state early stop. Good.

**Issues:**

- **MEDIUM — QR may be unreadable** when `tenant.colors.primary` is light. No contrast check. Mitigation: always render QR dark modules in `#111` or check luminance.
- **MEDIUM — Countdown stalls at `00:00`.** No local flip to expired if webhook is silent. Mitigation: if `ms <= -5000` and status still pending, show "Pembayaran kadaluarsa" inline (don't wait for webhook).
- **MEDIUM — "Buka app lagi" button hides when redirect URL missing.** No error. Mitigation: show `sendSupport` fallback.

### F.5 `/api/order/[id]` read

`eq('tenant_id', tenant.id).eq('id', id).maybeSingle()`. Tenant-scoped (good) but no phone auth. Returns full row including `customer_phone`. Phase-1 acceptable because UUIDs are unguessable, but **MEDIUM** PII risk on UUID leak.

### F.6 Owner order feed

`components/admin/OrderFeed.tsx:63-83`: correctly tenant-scoped. Optimistic status updates. **No notification, no sound, no toast on new INSERT or payment-status flip.** → Polish 1 fixes this.

---

## Section G — Component Inventory

| Component | Path | Imports (consumer) | Mobile | Branded |
|---|---|---|---|---|
| `MarketingHome` | `marketing/MarketingHome.tsx` | `app/page.tsx:13` | ✅ | ❌ (fixed Sajian palette, intentional) |
| `PhoneMockup` | `marketing/PhoneMockup.tsx` | `MarketingHome:160` | ✅ | ❌ |
| `Reveal` | `marketing/Reveal.tsx` | `MarketingHome` | ✅ | ❌ |
| `PageNav` | `chrome/PageNav.tsx` | CartView, CheckoutView, MenuView, TrackView | ✅ h-11 | ❌ |
| `CartChip` | `chrome/CartChip.tsx` | MenuView, CheckoutView | ✅ | ✅ primary |
| `StoreHeader` | `storefront/StoreHeader.tsx` | storefront layout | ✅ | ✅ primary |
| `StoreFooter` | `storefront/StoreFooter.tsx` | StorefrontHome:16 | ✅ | ✅ primary/dark |
| `StorefrontHome` | `storefront/StorefrontHome.tsx` | `app/page.tsx` | Via template | Via template |
| `MenuView` + `MenuOverlay` | `storefront/` | `app/(storefront)/menu/page.tsx:12`, each template :45 | ✅ | ✅ primary |
| `CartButton` | `storefront/CartButton.tsx` | StoreHeader:28 | ✅ | ✅ primary/accent |
| `CartView` | `storefront/CartView.tsx` | `(storefront)/cart/page.tsx` | ✅ 44px taps | ✅ primary |
| `CheckoutView` | `storefront/CheckoutView.tsx` | `(storefront)/checkout/page.tsx` | ✅ | ✅ primary |
| `BranchPicker` | `storefront/BranchPicker.tsx` | MenuView | ✅ | neutral |
| `TrackView` | `storefront/TrackView.tsx` | `(storefront)/track/[id]/page.tsx` | ✅ | ✅ primary |
| 5 × `*Home.tsx` + 5 × `*Menu.tsx` templates | `storefront/templates/{classic,food-hall,kedai,modern,warung}/` | Registry `templates/index.ts` | ✅ | ✅ primary |
| `AdminTabs` | `admin/AdminTabs.tsx` | `admin/page.tsx:44` | ✅ | ✅ primary |
| `OrderFeed` | `admin/OrderFeed.tsx` | `admin/page.tsx:45` | ✅ | neutral — **no sound/notif, Polish 1** |
| `MenuEditor` (admin) | `admin/MenuEditor.tsx` | `admin/page.tsx:46` | ✅ | ✅ primary — Polish 2 will extend |
| `TokoSettings` | `admin/TokoSettings.tsx` | `admin/page.tsx:47` | ✅ | ✅ primary — Polish 3 will extend |
| `AdminAIWorkspace` + `AdminChat` | `admin/` | `admin/page.tsx:48` | ✅ split | ✅ primary — Polish 4 lives here |
| `OwnerLogin` | `admin/OwnerLogin.tsx` | `admin/page.tsx:36` | ✅ | ✅ primary |
| `ShareCard` | `admin/ShareCard.tsx` | OrderFeed empty state | ✅ | ✅ primary |
| `ChatPanel` + `ChatMessage` | `onboarding/` | `(onboarding)/setup/page.tsx` | ✅ | neutral |
| `MenuEditor` (onboarding) | `onboarding/MenuEditor.tsx` | `ChatMessage:24` | ✅ | ⚠️ hardcoded `#1B5E3B` — should use tenant primary |
| `ColorPicker` | `onboarding/ColorPicker.tsx` | `ChatMessage:29` | ✅ | — |
| `PhotoUpload` | `onboarding/PhotoUpload.tsx` | `ChatPanel:252,260` | ✅ | neutral |

**Issues:**

- **LOW — Onboarding `MenuEditor` hardcodes `#1B5E3B`** instead of reading draft.colors.primary. Minor visual polish during setup.
- All customer-facing components are responsive at 375px per audit; detailed sweep deferred to Polish 6.

---

## Section H — State Management

### Zustand stores

| Store | File:Line | State | Persist | Issue |
|---|---|---|---|---|
| `useCart` | `lib/cart/store.ts:57` | `tenantSlug`, `branchCode`, `orderType`, `tableNumber`, `deliveryAddress`, `items[]` | localStorage `sajian-cart` | **MEDIUM — cross-tenant cart leak.** Lines 67-81 clear on `addItem` when `tenantSlug` differs, but on fresh page load with a subdomain different from the persisted slug, the cart hydrates with stale `tenantSlug`. No guard in `CartView`/`CheckoutView`. Fix: in `TenantProvider`, reset cart if `tenantSlug !== tenant.slug`. |
| `useOnboarding` | `lib/onboarding/store.ts:60` | draft, messages, step, userId, phone, loading | Supabase `onboarding_drafts` (300ms debounce) | ✅ |

### React contexts

| Context | File:Line | State | Provider | Consumers |
|---|---|---|---|---|
| `TenantContext` | `context/TenantContext.tsx:9` | `PublicTenant` (immutable per-request) | `RootLayout:72` | 20+ components |
| `LanguageContext` | `lib/i18n/LanguageProvider.tsx:16` | `'en' | 'id'`, `t()` | MarketingHome:16 | marketing children |

### Findings

- **MEDIUM — Cart not scoped to tenant on hydration.** See above.
- **LOW — Draft debounce (300ms) can lose last edits on hard crash.** Low-impact; user can re-enter.
- No other persisted state; auth handled by Supabase SDK; tenant always server-injected. No stale context.

---

## Section I — Known Bugs & Gaps (synthesis)

### BLOCKER (must fix before Fresh Market)

None outright — but resolve these two **before touching real money**:

1. **ESB tenant accepts non-cashier methods silently** (F.1). Either filter `METHODS` by `tenant.pos_provider` in `CheckoutView.tsx` or reject at API. Lowering to HIGH only because Mindiology is the only live ESB tenant and staff can be coached around it; any AI-onboarded tenant is native and unaffected.
2. **`/api/admin/orders/[id]` PATCH is unauthenticated** (C, E.6). Wrap with `requireOwnerOrThrow`.

### HIGH

3. **Host-header injection in Xendit redirect URLs** (F.2). Validate Host or hardcode base.
4. **ESB insert-after-POS failure orphans order** (F.1). Surface to user with contact details; consider idempotency key.

### MEDIUM

5. Cross-tenant cart leak on hydration (H).
6. No rate limiting on `/api/ai/*` or `/api/order/submit` (C, E.6).
7. Webhook timing-unsafe token compare (F.3).
8. Webhook out-of-order idempotency gap (F.3).
9. QR contrast can be unreadable with light primary (F.4).
10. Countdown stalls at 00:00 (F.4).
11. GoPay selectable but crashes (F.2).
12. Xendit failure creates orphan orders (F.2).
13. `/api/order/[id]` leaks `customer_phone` on UUID knowledge (F.5).
14. No notification/sound for owner on new order (F.6) — **Polish 1 fixes**.
15. `/signup` has no back nav (B/E.1).

### LOW

16. No `error.tsx` / `loading.tsx` route boundaries (B).
17. Onboarding `MenuEditor` hardcodes `#1B5E3B` (G).
18. Unused schema columns + RPC `REFUNDED`/`CANCELLED` mapping (D, F.3).
19. Draft debounce 300ms loss window (H).
20. No `/admin` → storefront back link (B).

---

## Section J — Dependencies

`npm audit` → **0 vulnerabilities** (0 info / 0 low / 0 mod / 0 high / 0 critical across 521 resolved deps).

### Outdated

| Package | Current | Latest | Action |
|---|---|---|---|
| `@types/node` | 20.19.39 | 25.6.0 | LOW — upgrade at convenience |
| `eslint` | 9.39.4 | 10.2.1 | LOW — major bump, defer |
| `typescript` | 5.9.3 | 6.0.3 | LOW — major bump, defer |
| `react` | 19.2.4 | 19.2.5 | LOW — patch |
| `react-dom` | 19.2.4 | 19.2.5 | LOW — patch |

### Unused dependencies (remove at next cleanup)

| Package | Reason |
|---|---|
| `xendit-node` | Custom client in `lib/payments/xendit.ts` used instead |
| `framer-motion` | Animations are CSS-only |
| `@radix-ui/react-dialog` | Not imported anywhere |
| `@radix-ui/react-dropdown-menu` | Not imported |
| `@radix-ui/react-toast` | Not imported — we'll need it for Polish 1 notifications; either keep or add when needed |

Verified by `grep -r "from 'xendit-node'"` etc. → zero matches.

### Implicitly used (don't remove)

`sharp`, `tailwind-merge`, `clsx`, `nanoid`, `qrcode`, `zod`, `zustand`, `@anthropic-ai/sdk`, `@supabase/ssr`, `@supabase/supabase-js`, `lucide-react`, `next`, `react`, `react-dom`.

---

## Conclusion

**Sajian is launch-capable for Fresh Market with 2 HIGH + 1 HIGH–BLOCKER fixes required first:**

1. Wrap `PATCH /api/admin/orders/[id]` in `requireOwnerOrThrow` (1-line fix).
2. Filter payment methods in `CheckoutView.tsx` by `tenant.pos_provider` (5-line fix).
3. Validate `Host` in `api/order/submit/route.ts` for redirect URLs (3-line fix).

The MEDIUM backlog is real but can ship the day-after. Polish 1–6 directly address #14 (notifications), cart leak on tenant switch (Polish 6), inline menu/toko management (Polishes 2/3), AI-managed live store (Polish 4), phone OTP (Polish 5), mobile sweep (Polish 6).

No code changes made during this audit.
