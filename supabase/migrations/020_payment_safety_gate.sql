-- Sajian 020: payment-safety gate.
--
-- Single-source-of-truth feature flag for digital payment readiness.
-- The current Xendit integration uses ONE global XENDIT_SECRET_KEY
-- for every tenant — every tenant's QRIS / e-wallet payment routes
-- to whichever Xendit business owns that key. Until per-tenant
-- Xendit credentials ship (Phase 2), digital payments must be hard-
-- blocked at every layer:
--
--   1. /api/order/submit refuses any non-cashier payment_method.
--   2. CheckoutView filters available methods down to cashier.
--   3. /api/admin/payment-methods refuses to enable any digital
--      method (toggle_payment_method action also rerouted to
--      log_roadmap_request).
--
-- Operators can flip this true ONLY after per-tenant Xendit lands.

create table if not exists public.platform_flags (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists trg_platform_flags_updated on public.platform_flags;
create trigger trg_platform_flags_updated
  before update on public.platform_flags
  for each row execute function public.update_updated_at();

alter table public.platform_flags enable row level security;
-- No public read/write policies. Service role only — flags are
-- read by server code on the hot path and writes happen from the
-- /admin/codegen ops surface (admin_users gate at the API layer).

insert into public.platform_flags (key, value, description)
values
  (
    'digital_payments_enabled',
    'false'::jsonb,
    'Master gate for any payment_method other than cashier. Stays false until each tenant has its own xendit_secret_key + completed verification. See migration 020 header for context.'
  )
on conflict (key) do nothing;
