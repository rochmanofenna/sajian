# Sajian

AI-powered multi-tenant restaurant platform for Indonesia. Single Next.js app, Supabase backend, subdomain-routed tenants.

Phase 1 goal: `mindiology.sajian.app` takes a real order that hits the POS at Emerald Bintaro.

## Stack

- **Next.js 16** (App Router, Server Components, Route Handlers)
- **Supabase** (Postgres + Auth + Realtime) — Singapore region
- **Tailwind v4** (CSS-native config in `globals.css`)
- **Zustand** cart (localStorage persist, single-tenant at a time)
- **ESB POS** integration for ESB-backed tenants (company `MBLA`, branch `MCE` for Mindiology)
- **Xendit** — Phase 2 (online payments)
- **Fonnte WhatsApp** — Phase 2 (notifications stubbed with `console.log` for now)

## Phase 1 scope

| Area | Phase 1 | Phase 2 |
|------|---------|---------|
| Order types | takeaway / dine-in / delivery | same |
| Payment | **Bayar di Kasir only** (QR-to-cashier) | Xendit online (DANA, QRIS, OVO, GoPay) |
| Auth | none on storefront, none on `/admin` | Supabase Auth, owner_phone gate |
| Notifications | stub (console.log) | Fonnte WhatsApp |
| Menu sync | live from ESB per request | scheduled sync into Supabase |
| Promotions/vouchers | — | membership + ESB promotion flow |

## Running locally

1. Install deps:
   ```bash
   npm install
   ```

2. Copy env template and fill in Supabase creds:
   ```bash
   cp .env.local.example .env.local
   ```

3. Create a Supabase project (Singapore region recommended) and apply the schema:
   ```bash
   # In Supabase SQL editor, run in order:
   # 1. supabase/migrations/001_initial_schema.sql
   # 2. supabase/seed/001_mindiology.sql
   ```

4. Enable subdomain routing on localhost. Edit `/etc/hosts`:
   ```
   127.0.0.1  mindiology.localhost
   ```

5. Start dev:
   ```bash
   npm run dev
   ```

6. Visit:
   - Marketing root: http://localhost:3000
   - Tenant storefront: http://mindiology.localhost:3000
   - Tenant admin: http://mindiology.localhost:3000/admin

## ESB integration

The ESB POS API is the live order system. The client (`src/lib/esb/client.ts`) is a direct port of the authoritative middleware at `~/mindiology/kamarasan-app/server/index.ts` — **not** the spec (which had multiple wrong endpoint paths).

Key rules:
- `visitPurposeID` is dynamic per branch — fetch from `/qsv1/setting/branch` → `orderModes[].visitPurposeID`. Never hardcode.
- Bayar di Kasir uses `/qsv1/order/qrData` — **not** `/qsv1/order`. No `calculate-total` needed.
- Online orders use the two-step `calculate-total` → `order` flow, with `amount = grandTotal - roundingTotal`.
- Errors surface as `ESBError`; API routes sanitize them before shipping to the browser.

Credentials for Mindiology come from `~/mindiology/kamarasan-app/server/.env.production` and are inlined into the seed SQL.

## File layout

```
src/
├── app/
│   ├── (storefront)/        # tenant pages: /menu, /cart, /checkout, /track/[id]
│   ├── admin/               # merchant dashboard (live order feed)
│   ├── api/                 # route handlers — menu, branches, order flow
│   ├── layout.tsx           # root layout — resolves tenant, injects theme vars
│   └── page.tsx             # branches on tenant presence (storefront vs marketing)
├── components/
│   ├── marketing/           # root domain landing
│   ├── storefront/          # tenant storefront
│   └── admin/               # dashboard widgets
├── context/
│   └── TenantContext.tsx    # client-side tenant provider
├── lib/
│   ├── esb/                 # ESB client + types + status mapping
│   ├── supabase/            # browser / server / service / middleware clients
│   ├── cart/                # Zustand store
│   ├── order/               # zod schemas + ESB payload mapper
│   ├── notify/              # WhatsApp stub
│   ├── api/                 # shared API helpers
│   ├── tenant.ts            # cached getTenant() resolver
│   └── utils.ts             # cn(), formatCurrency, formatRelativeTime
├── middleware.ts            # subdomain → x-tenant-slug header
└── supabase/
    ├── migrations/          # schema
    └── seed/                # tenant + branch seeds
```

## Phase 1 handoff checklist

- [ ] Create Supabase project (Singapore), copy URL + anon + service_role into `.env.local`.
- [ ] Run `001_initial_schema.sql` in Supabase SQL editor.
- [ ] Run `001_mindiology.sql` (seeds tenant + 4 branches with real ESB token).
- [ ] Add `127.0.0.1 mindiology.localhost` to `/etc/hosts`.
- [ ] `npm run dev`.
- [ ] Visit `http://mindiology.localhost:3000` — branches should load from ESB.
- [ ] Add an item to cart, check out, submit → order should appear at Emerald Bintaro POS.
- [ ] Open `http://mindiology.localhost:3000/admin` — the order should appear live.
- [ ] Deploy to Vercel, point `*.sajian.app` wildcard DNS at Vercel.

## Things intentionally deferred

- Xendit integration (Phase 2 payment)
- Supabase Auth on `/admin` (Phase 2 — currently anyone on the subdomain can access)
- Fonnte WhatsApp (stubbed; swap one function when token is available)
- Menu/modifier sync into Supabase (ESB is queried per request for now; cache later)
- ESB membership + promotion flows (endpoints wrapped but no UI)

## Archived

The previous RN template extraction lives at `~/.trash/esb_app_infrastructure_*` — 14k lines of working code preserved for reference, not deleted.
