@AGENTS.md

# Sajian engineering notes

## Sources of truth

- **ESB API**: the authoritative reference is `~/mindiology/kamarasan-app/server/index.ts`. The spec at `~/sajian-phase-1-spec.md` had multiple wrong endpoint paths. Always cross-check against the working middleware before making ESB changes.
- **ESB credentials for Mindiology**: `~/mindiology/kamarasan-app/server/.env.production` (inlined into `supabase/seed/001_mindiology.sql`).

## Non-obvious rules

- `visitPurposeID` is **dynamic per branch** — fetch from `/qsv1/setting/branch` → `orderModes[].visitPurposeID`. Never hardcode or store in `pos_config`.
- Bayar di Kasir uses `/qsv1/order/qrData` — not `/qsv1/order`. It needs no `calculate-total`, no `paymentMethodID`, and no `amount`.
- For online orders, submit with `amount = grandTotal - roundingTotal`. ESB returns `roundingTotal` as a negative delta.
- qrData is a base64-encoded encrypted blob with `+`, `/`, `=` characters. Never pass it through URL params — `+` corrupts to space and breaks POS decoding. Pass it via state/props.
- ESB bearer tokens are per-tenant (stored in `tenants.pos_config.esb_bearer_token`). Per-user `userToken` can override for `/api/user/*` endpoints; Phase 1 doesn't use user auth.
- Middleware matcher **excludes `/api/*`**, so `x-tenant-slug` header is only set on page routes. API routes resolve tenant via Host header fallback inside `getTenant()`.
- Next.js 16: `middleware.ts` still works but is deprecated in favour of `proxy.ts`. Rename when convenient.

## Dev loop

```bash
npm run dev
npx tsc --noEmit       # types only
npm run build          # full prod build, static page collection
```

Subdomains on localhost require `/etc/hosts` entries like `127.0.0.1 mindiology.localhost`.

## Phase 2 TODOs

- Xendit integration — stub lives in `/api/order/submit` (currently rejects non-cashier).
- Fonnte WhatsApp — swap one block in `src/lib/notify/whatsapp.ts`.
- Supabase Auth on `/admin` — tighten RLS on `orders` (currently permissive).
- Menu sync into Supabase for ESB tenants so the storefront stays fast when ESB is slow.
