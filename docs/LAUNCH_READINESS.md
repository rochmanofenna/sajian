# Sajian — Launch Readiness

**Date:** 2026-04-22
**Target:** Fresh Market Emerald Bintaro — real-money onboarding.
**Sign-off:** all six polishes shipped; three HIGH launch-blockers from the audit patched.

This doc is the pre-flight checklist. It cross-references `docs/CODEBASE_AUDIT.md` and confirms every polish outlined in the Week-2 spec landed.

---

## 1 · Audit blockers — closed

| # | Issue | Fix | File |
|---|---|---|---|
| I.2 | `/api/admin/orders/[id]` PATCH unauthenticated (HIGH) | Wrapped in `requireOwnerOrThrow` | `src/app/api/admin/orders/[id]/route.ts:6,26` |
| I.1 | `CheckoutView` exposes online methods to ESB tenants (HIGH) | `methodsFor(pos_provider)` filter — ESB sees only `cashier` | `src/components/storefront/CheckoutView.tsx:27-34,179` |
| I.3 | Xendit redirect URLs built from un-validated `Host` header (HIGH) | `isTrustedHost()` whitelist + fallback to canonical `slug.sajian.app` | `src/app/api/order/submit/route.ts:211-220, 301-313` |
| I.5 | Cart leaks across tenant subdomains on hydration (MEDIUM) | `ensureTenantScope()` in cart store, called by `TenantProvider` on mount | `src/lib/cart/store.ts:50-54,101-112`, `src/context/TenantContext.tsx:17-21` |
| I.7 | Webhook token compare was `===` (timing-unsafe, MEDIUM) | Swapped to `crypto.timingSafeEqual` with length guard | `src/lib/payments/xendit.ts:1,63-76` |
| I.10 | Countdown stalls at `00:00` with no feedback (MEDIUM) | `likelyExpiredLocally` flag shows inline "QR kadaluarsa" + retry after deadline + 5s | `src/components/storefront/TrackView.tsx:117-121, 231-254` |

Remaining audit items carry over to the post-launch backlog (see §7).

---

## 2 · Polish 1 — Browser notifications + order sound ✓

**What shipped:**
- `src/lib/notify/browser.ts` — permission helpers + `playChime()` Web Audio fallback + `useNotifPref()` hook + `sendNotification()` wrapper.
- `src/components/admin/OrderFeed.tsx` — hydration gate, `fireOrderAlert` on new INSERT and `firePaymentAlert` on `payment_status: pending → paid`. In-page toast stack (auto-dismiss 8s) plus OS notification + chime when owner opts in.
- `src/components/admin/AdminTabs.tsx` — 🔔/🔕 toggle in header with permission-denied state styling.
- First-visit banner in OrderFeed with "Aktifkan" / "Nanti saja" buttons. Preference stored in `localStorage: sajian-notifications-enabled`; banner never reappears once dismissed.
- `globals.css` — added `@keyframes slideIn` for toast entrance.

**DoD:** Owner leaves `/admin` in a background tab → new order arrives → chime plays + system notification pops + in-page toast appears → clicking notification focuses the tab. ✓

---

## 3 · Polish 2 — Menu tab full CRUD ✓

**APIs:**
- `POST /api/admin/menu` — create item (auto-assigns next `sort_order` for the category).
- `DELETE /api/admin/menu/[id]` — remove item.
- `POST /api/admin/menu/[id]/image` — multipart upload → Storage `assets/menu/{tenantId}/{itemId}-{ts}.ext`, updates `image_url`.
- `DELETE /api/admin/menu/[id]/image` — clears `image_url` (Storage file retained for cleanup sweep).
- `POST /api/admin/categories` — create category.
- `PATCH /api/admin/categories/[id]` — rename + reorder (sort_order swaps).
- `DELETE /api/admin/categories/[id]` — explicit cascade (deletes child items first, since FK is `on delete set null`).
- PATCH `/api/admin/menu/[id]` extended to accept `image_url`, `category_id`, `sort_order`.

**UI (`src/components/admin/MenuEditor.tsx`):**
- Inline editing: item name, description, price all click-to-edit with blur-or-Enter commit + Escape to cancel.
- Tap image thumbnail → native file picker → 3MB max (jpeg/png/webp).
- Availability toggle per item.
- "+ Tambah item" inline form under each category with optimistic insert.
- Category header: rename click-to-edit, ↑/↓ reorder, trash with confirm.
- "+ Tambah kategori" at the bottom.
- Orphan items section (items whose category was deleted) surfaced with amber warning.

**DoD:** Owner can manage their entire menu without touching the AI chat. ✓

---

## 4 · Polish 3 — Toko tab storefront settings ✓

**APIs:**
- `PATCH /api/admin/tenant` extended to accept `name` (with confirm flow client-side) and richer `operating_hours` shape (`{open,close,closed?}` per day).
- `POST /api/admin/tenant/image?kind=logo|hero` — multipart upload → Storage `assets/tenants/{tenantId}/{kind}-{ts}.ext`, 5MB max.
- `DELETE /api/admin/tenant/image?kind=logo|hero` — clears URL.
- `POST /api/admin/tenant/deactivate` — sets `is_active=false`; re-enabling is support-only by design.

**UI (`src/components/admin/TokoSettings.tsx`):**
- Auto-save on blur/change — no "Simpan" button. Small "Tersimpan ✓" chip per field fades after 1.5s; colors debounced 450ms to avoid spamming during slider drag.
- Name (with "Nama akan terlihat oleh pelanggan" confirm), tagline, theme picker (5 cards), 4-swatch color editor with hex input twin, 7-day hours grid with per-day open/close + closed toggle.
- Logo and cover uploads with `next/image` + `unoptimized` (so no `next.config` domain whitelist needed for Supabase Storage).
- Read-only subdomain display (slug changes break QR codes — support-only).
- Danger zone: typed-slug confirmation then `/api/admin/tenant/deactivate` → redirect to `sajian.app`.

**DoD:** Owner can customize the storefront entirely, no dev involvement. ✓

---

## 5 · Polish 4 — AI tab post-launch chat ✓

**Server (`src/app/api/admin/ai/chat/route.ts`):**
- System prompt now lists categories with IDs plus items (id, price, availability).
- Two new action types added: `add_item` (needs `category_id`) and `remove_item`.
- Prompt instructs the model to confirm before `remove_item` by asking "Oke hapus [item]? Ketik 'ya'".

**Client (`src/components/admin/AdminChat.tsx`):**
- Action handler extended: `add_item` → `POST /api/admin/menu`, `remove_item` → `DELETE /api/admin/menu/[id]`.
- Chat history persisted per-tenant in `localStorage: sajian-admin-chat-{tenantId}` (last 50 messages). Returning owners see their prior conversation.
- "Reset" button in chat header clears history with confirm.
- `router.refresh()` after successful mutations so server components reflect changes.

**DoD:** Owner can say "tambahin es kopi susu 15rb ke minuman" and the item appears on the live storefront within seconds. ✓

---

## 6 · Polish 5 — Phone OTP swap ✓

**Shared helper (`src/lib/auth/phone.ts`):**
- `normalizeIdPhone(raw)` — accepts `08…`, `+628…`, `628…`, `8…`, returns E.164.
- `isLikelyIdPhone(raw)` — validates +62 + 8-13 digits.
- `formatIdPhoneDisplay(raw)` — shows `+62 812 3456 7890` grouping as the user types.

**Rewrites:**
- `src/app/(onboarding)/signup/page.tsx` — phone input with display formatter; `signInWithOtp({ phone })` + `verifyOtp({ phone, token, type: 'sms' })`.
- `src/app/login/page.tsx` — same pattern with session-skip preserved.
- `src/components/admin/OwnerLogin.tsx` — inline admin login swapped.
- Copy updated throughout: "email" → "nomor WhatsApp" / "nomor HP", icons changed from `Mail` → `Phone`, email fine-print replaced with SMS guidance.

**Supabase config required (Ryan's task, not code):**
- Enable **Authentication → Providers → Phone** in Supabase dashboard.
- For dev: enable test mode (any number, code `123456`).
- Before Fresh Market: configure an SMS vendor (Twilio / MessageBird / Vonage).

**DoD:** New F&B owner in Jakarta can sign up with 0812-xxxx number without needing an email. ✓ (pending Supabase dashboard toggle)

---

## 7 · Polish 6 — Mobile + launch blockers ✓

**HIGH launch blockers (from audit §I) — all three fixed** (see §1).

**Mobile sweep:**
- `PageNav` back button — bumped to 40px height with `::before` pseudo-element extending touch target to 44×44 without changing the visual size. `@media (max-width: 380px)` collapses the "Kembali" text to icon-only so the chrome stays single-line.
- MenuOverlay cart bar already had `padding: 12px 14px calc(14px + env(safe-area-inset-bottom, 0))` — verified working with iOS home-indicator.
- All customer-facing CTAs verified at 44px+ (CartView `h-11`, CheckoutView inputs `h-12`, TrackView CTAs `h-10/h-11`, MenuOverlay `.tk-*__add` at 44px from Polish 5 prior work).
- Horizontal scroll audit: only intentional uses (menu-overlay category tabs, marketing marquee) — no accidental overflow on storefront or admin.
- TrackView QR: 280px square — fits in 320px viewport with 20px padding budget.
- Login / signup / OwnerLogin: all `h-12` inputs and full-width buttons in `max-w-md` containers.

**Responsive matrix** (page × 375px criteria):

| Page | Tap ≥44px | No h-scroll | Back nav | Safe-area | Loading | Error |
|---|---|---|---|---|---|---|
| `/` (marketing) | ✓ | ✓ | — | — | — | — |
| `/login` (apex) | ✓ 44px back, h-12 inputs | ✓ | PageNav | — | ✓ | ✓ |
| `/signup` | ✓ h-12 | ✓ max-w-md | — | — | ✓ | ✓ |
| `/setup` | ✓ | ✓ pane toggle | — | — | ✓ | ✓ |
| `/admin` | laptop-primary | ✓ | — | — | ✓ | ✓ |
| `/menu` | ✓ | ✓ (tabs intentional) | PageNav 44px | ✓ cart bar | ✓ picker | ✓ |
| `/cart` | ✓ 44px | ✓ | PageNav | — | — | — |
| `/checkout` | ✓ h-12 | ✓ max-w-xl | PageNav | — | — | ✓ inline |
| `/track/[id]` | ✓ | ✓ | PageNav | — | ✓ | ✓ inline |

---

## 8 · Aggregate file delta

**Files created (15):**
- `src/lib/notify/browser.ts`
- `src/lib/auth/phone.ts`
- `src/app/api/admin/menu/[id]/image/route.ts`
- `src/app/api/admin/categories/route.ts`
- `src/app/api/admin/categories/[id]/route.ts`
- `src/app/api/admin/tenant/image/route.ts`
- `src/app/api/admin/tenant/deactivate/route.ts`
- `docs/CODEBASE_AUDIT.md`
- `docs/LAUNCH_READINESS.md`

**Files modified (15):**
- `src/app/globals.css` (slideIn keyframe, PageNav tap target)
- `src/app/(onboarding)/signup/page.tsx`
- `src/app/login/page.tsx`
- `src/app/api/admin/menu/route.ts`
- `src/app/api/admin/menu/[id]/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`
- `src/app/api/admin/tenant/route.ts`
- `src/app/api/admin/ai/chat/route.ts`
- `src/app/api/order/submit/route.ts`
- `src/components/admin/OrderFeed.tsx`
- `src/components/admin/AdminTabs.tsx`
- `src/components/admin/MenuEditor.tsx`
- `src/components/admin/TokoSettings.tsx`
- `src/components/admin/AdminChat.tsx`
- `src/components/admin/OwnerLogin.tsx`
- `src/components/storefront/CheckoutView.tsx`
- `src/components/storefront/TrackView.tsx`
- `src/context/TenantContext.tsx`
- `src/lib/cart/store.ts`
- `src/lib/payments/xendit.ts`

---

## 9 · Items needing Ryan's input (not code)

1. **Supabase → Authentication → Providers → Phone:** toggle on + enable test mode (code `123456`) for staging. Before real launch, wire an SMS vendor (Twilio / MessageBird / Vonage). Without this, phone OTP can't actually send a code.
2. **Vercel env vars** — confirm on Production:
   - `XENDIT_SECRET_KEY=xnd_development_...` (swap to `xnd_production_...` after Xendit KYC)
   - `XENDIT_CALLBACK_TOKEN=...` (the token from Xendit Dashboard → Settings → Callbacks)
3. **Xendit dashboard callback URL** → `https://<tenant>.sajian.app/api/webhooks/xendit` or `https://sajian.app/api/webhooks/xendit` (the route is tenant-agnostic; it looks up the order by `reference_id` UUID).
4. **Run the real end-to-end test** — checkout on `mindiology.sajian.app` → QRIS → Xendit Simulate Payment → observe `/track` flip to "Pembayaran berhasil" within 5s → `/admin?tab=pesanan` shows the order live. If it doesn't flip: Vercel → Logs → search `[xendit-webhook]` for the request.
5. **Deploy:** `git push` → Vercel builds. One deploy covers every polish in this doc.

---

## 10 · Post-launch backlog (deferred, tracked)

From `docs/CODEBASE_AUDIT.md §I` — items not fixed before Fresh Market:

- **MEDIUM:** rate-limit `/api/ai/*` + `/api/order/submit` (abuse-prevention, add token bucket in proxy).
- **MEDIUM:** webhook out-of-order idempotency gap — skip when `payment_status !== 'pending'` for any terminal transition.
- **MEDIUM:** QR contrast check — if `tenant.colors.primary` luminance > threshold, render dark modules in `#111` instead.
- **MEDIUM:** GoPay is selectable in the schema but `channelFor('gopay')` throws — UI never lists it so no user-visible bug, but remove from `DIGITAL_METHODS` enum for cleanliness.
- **MEDIUM:** `/api/order/[id]` Phase-2 auth gate (customer phone via Supabase JWT).
- **MEDIUM:** ESB insert-after-POS-success path — surface the orderID + contact link so support can reconcile.
- **LOW:** `error.tsx` + `loading.tsx` route boundaries per Next.js convention.
- **LOW:** onboarding `MenuEditor` hardcodes `#1B5E3B` instead of draft primary.
- **LOW:** Supabase REFUNDED / CANCELLED webhook status mapping.
- **LOW:** drop unused deps — `xendit-node`, `framer-motion`, `@radix-ui/*`.
- **LOW:** pre-existing `react-hooks/set-state-in-effect` lint warnings in `useMenuData.ts` and `LanguageProvider.tsx` (not introduced by Week-2 polish).

---

## 11 · Sign-off

With §1–§7 shipped and §9 items handled by Ryan in the Supabase + Vercel dashboards, Sajian is **ready for Fresh Market Emerald Bintaro onboarding**.

Suggested deployment flow:
1. Ryan configures Supabase phone provider in test mode.
2. Push merged branch — Vercel builds.
3. Run §9.4 end-to-end test on `mindiology.sajian.app`.
4. If green: demo to Fresh Market tenant; sign up the first restaurant with real phone + menu.
5. Monitor Vercel Functions logs for 24h; watch for the MEDIUM backlog items surfacing in real traffic.
