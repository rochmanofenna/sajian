-- Sajian 018: settings batch — favicon, tax/service charge, social
-- handles, delivery zones, payment-method toggles, custom domains.
--
-- Six new tenants columns are flat additions. Three new tables
-- (delivery zones, payment-method toggles, custom-domain registrations)
-- model their respective collections cleanly. Each table inherits the
-- standard owner-RLS pattern (read/write by tenant ownership; service
-- role bypasses for AI-driven actions).

-- ── tenants flat columns ──────────────────────────────────────────────
alter table public.tenants
  add column if not exists favicon_url text,
  add column if not exists tax_rate_bps integer not null default 0
    check (tax_rate_bps >= 0 and tax_rate_bps <= 5000),
  add column if not exists service_charge_bps integer not null default 0
    check (service_charge_bps >= 0 and service_charge_bps <= 5000),
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle text,
  add column if not exists whatsapp_handle text;

comment on column public.tenants.tax_rate_bps is
  'Tax rate in basis points (1 bp = 0.01%). 1100 = 11% PPN.';
comment on column public.tenants.service_charge_bps is
  'Service charge in basis points. 500 = 5% (typical resto).';

-- ── delivery zones ────────────────────────────────────────────────────

create table if not exists public.tenant_delivery_zones (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  fee_cents integer not null check (fee_cents >= 0),
  radius_km numeric(5, 2),
  polygon jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_zones_tenant
  on public.tenant_delivery_zones(tenant_id, sort_order)
  where is_active = true;

alter table public.tenant_delivery_zones enable row level security;

drop policy if exists "delivery_zones_owner_all" on public.tenant_delivery_zones;
create policy "delivery_zones_owner_all" on public.tenant_delivery_zones
  for all
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()))
  with check (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

drop policy if exists "delivery_zones_public_read" on public.tenant_delivery_zones;
create policy "delivery_zones_public_read" on public.tenant_delivery_zones
  for select using (is_active = true);

-- ── payment method toggles ────────────────────────────────────────────
-- One row per (tenant, method). is_enabled toggles whether checkout
-- offers the method; config is the per-method JSON the Xendit/QRIS
-- adapters consume.

create table if not exists public.tenant_payment_methods (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  method text not null,
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, method)
);

drop trigger if exists trg_tpm_updated on public.tenant_payment_methods;
create trigger trg_tpm_updated before update on public.tenant_payment_methods
  for each row execute function public.update_updated_at();

alter table public.tenant_payment_methods enable row level security;

drop policy if exists "tpm_owner_all" on public.tenant_payment_methods;
create policy "tpm_owner_all" on public.tenant_payment_methods
  for all
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()))
  with check (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

-- ── custom domains ────────────────────────────────────────────────────
-- One verified domain per tenant for now. The verification + SSL
-- pipeline is out of scope for this migration; we capture the
-- record + token so the AI can return DNS instructions to the owner
-- and a follow-up cron / webhook flips verified_at.

create table if not exists public.tenant_custom_domains (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  domain text not null unique,
  cname_target text not null,
  verification_token text not null,
  verified_at timestamptz,
  ssl_status text not null default 'pending'
    check (ssl_status in ('pending', 'provisioning', 'active', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_tcd_updated on public.tenant_custom_domains;
create trigger trg_tcd_updated before update on public.tenant_custom_domains
  for each row execute function public.update_updated_at();

alter table public.tenant_custom_domains enable row level security;

drop policy if exists "tcd_owner_all" on public.tenant_custom_domains;
create policy "tcd_owner_all" on public.tenant_custom_domains
  for all
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()))
  with check (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));
