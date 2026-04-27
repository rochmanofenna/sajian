# Tenant identity on customer-facing surfaces

> **Rule:** every customer-facing surface that renders a tenant name MUST resolve it from a single canonical source — `tenants.name` joined off `tenant_id`, or a tested formatter wrapping a snapshot column. Never read tenant identity from cookies, sessions, third-party API responses, hardcoded copy, or stale denormalized fields.

## Why this exists

Three "wrong tenant displayed on customer-facing surface" bugs have shipped to prod from different code paths:

1. **Xendit QR** rendered the previous tenant's name on the payment screen — third-party API returned a cached merchant name from before the rename.
2. **Order confirmation** displayed `#MAIN-0002 / Burger Lakeside` for an order placed at Sandwicherie Lakeside — `branches.name` snapshotted the old tenant name at launch and never re-synced after a rename.
3. **Receipt branch line** kept showing the stale "Burger Lakeside" string after the data fix because the snapshot was carried forward into `orders.branch_name` at submission time.

Different root causes, identical symptom: the customer sees the wrong restaurant name. Every recurrence erodes trust in a way that's invisible to the team and obvious to the owner. We fix this class of bug by collapsing every read path into one verified source.

## The contract

**Customer-facing surfaces** (storefront `/track`, `/akun/pesanan`, `/`, admin `/admin/orders`, every receipt / email / WhatsApp / SMS template, every payment screen):

- Tenant name comes from `tenants.name` resolved off the order/payment/whatever's `tenant_id`. Never a session, cookie, or upstream third-party response.
- Branch name uses the snapshot on `orders.branch_name`, but funneled through `formatOrderLocationLabel()` / `formatOrderBranchSuffix()` in `src/lib/orders/display.ts`. Default branches carry `name=NULL` (migration 021); the helpers fall back to tenant name or omit the line accordingly.
- Adding a new customer-facing surface that displays tenant identity means importing the helper, not re-inlining the logic.

**Internal / admin-only surfaces** that are unambiguously single-tenant by URL (e.g. `/admin/store` settings page where the user IS the owner of one tenant) may read identity from session-scoped tenant resolution — that path is gated by owner auth so cross-tenant confusion isn't possible.

## Anti-patterns — never do these

- Read tenant name from a Xendit/Fonnte/ESB response and display it. Third parties cache; they're not your source of truth.
- Read tenant name from a cookie set during signup. Cookies persist across tenant switches.
- Display `branch.name` directly without going through the formatter. The formatter is what handles default-branch NULL semantics.
- Add a `tenant_name` column to a denormalized table without writing a sync trigger or accepting that it's a snapshot. If it's a snapshot, the formatter handles drift; if it's not, you've shipped tomorrow's regression.
- **Snapshot a fallback into `orders.branch_name` when the source is null.** When `branches.name` is NULL (default branch post-migration 022), preserve that NULL in the snapshot — do NOT fall back to `branch_code` ("MAIN") or any other internal identifier. The display formatters expect NULL to mean "use tenant.name"; surfacing "MAIN" or other codes leaks internal state onto receipts.

## Adding a new tenant-identity display

1. Pull `tenant.name` from `tenants` joined on `tenant_id` (or pass it through props from a server component that already resolved it).
2. If the surface displays branch context, import from `@/lib/orders/display` and use the right helper:
   - `formatOrderLocationLabel({ branchName, tenantName })` — line that ALWAYS prints. Falls back to tenant name when branch is null.
   - `formatOrderBranchSuffix(branchName)` — returns null on default-branch case, so the caller can drop the separator. Use where the line reads `"DATE · branch"` and you don't want `"DATE · —"` on null.
3. Add a Vitest case to `src/lib/orders/display.test.ts` if you discover a new edge case.

## Migration history

- **2026-04-27 — migration 021** (`021_default_branch_no_name_snapshot.sql`): drop NOT NULL on `branches.name`, backfill default branches whose name still equals tenants.name to NULL (condition was inverted — see 022), update `onboarding_launch` RPC to seed `name=NULL` going forward. Receipt + admin + customer surfaces patched to use the formatters.
- **2026-04-27 — migration 022** (`022_default_branch_legacy_rename_backfill.sql`): re-do the backfill with the correct condition (`b.name != t.name`) — the actual stale pattern is "tenant was renamed, branch wasn't" — guarded by `b.created_at < deploy_time` so deliberate post-deploy MAIN-branch overrides aren't clobbered. Cascades NULL into `orders.branch_name` snapshots that pointed at a now-nulled branch.
- **2026-04-27 — order submit fix** (preventive, post-022 audit): `src/app/api/order/submit/route.ts` was falling back `branchRow.data?.name ?? body.branchCode` — meaning post-022 default branches would re-snapshot `branch_name = "MAIN"` on every new order. Changed fallback to `?? null` so the NULL signal flows through to the snapshot and the display formatters render tenant.name correctly.

## Audit log

- **2026-04-27** — full grep across `src/` for `tenant.name | tenant_name | merchantName` confirmed every customer-facing read resolves from the canonical `tenant` prop (page-level `getPublicTenant()` resolution) or via `formatOrderLocationLabel()`. No alternative paths found.
