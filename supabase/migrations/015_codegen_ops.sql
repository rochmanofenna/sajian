-- Sajian 015: codegen ops — feature flags, event log, circuit trips,
-- admin users, global kill switch.
--
-- Phase 4 hardens the codegen pipeline from "technically shipped" to
-- "safely in front of real tenants, measurably." Every new table here
-- serves one of: gating (flags + global), observability (events),
-- automated defense (circuit trips), or operator access (admin_users).

-- ═══════════════════════════════════════════════════
-- feature_flags — per-tenant codegen toggle
-- ═══════════════════════════════════════════════════

create table if not exists public.feature_flags (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  codegen_enabled boolean not null default false,
  codegen_enabled_at timestamptz,
  codegen_enabled_by text, -- 'admin' | 'self_opt_in' | 'canary_auto'
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_feature_flags_updated on public.feature_flags;
create trigger trg_feature_flags_updated before update on public.feature_flags
  for each row execute function public.update_updated_at();

alter table public.feature_flags enable row level security;

-- Owners can read their own flag row (UI needs it to show the toggle
-- state in /setup). Writes go through service role only — we don't want
-- an owner to bypass the breaker by flipping the row directly.
drop policy if exists "feature_flags_owner_read" on public.feature_flags;
create policy "feature_flags_owner_read" on public.feature_flags
  for select using (
    tenant_id in (select id from public.tenants where owner_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════
-- codegen_events — observability stream
-- ═══════════════════════════════════════════════════

create table if not exists public.codegen_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_codegen_events_tenant_time
  on public.codegen_events(tenant_id, created_at desc);
create index if not exists idx_codegen_events_type_time
  on public.codegen_events(event_type, created_at desc);

alter table public.codegen_events enable row level security;
-- No reader policies. Only service role reads/writes these rows.

-- ═══════════════════════════════════════════════════
-- codegen_circuit_trips — audit of auto-disables
-- ═══════════════════════════════════════════════════

create table if not exists public.codegen_circuit_trips (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid,  -- null for global trips
  reason text not null,
  metric_snapshot jsonb,
  tripped_at timestamptz not null default now(),
  reset_at timestamptz,
  reset_by text
);

create index if not exists idx_circuit_trips_tenant
  on public.codegen_circuit_trips(tenant_id, tripped_at desc);
create index if not exists idx_circuit_trips_open
  on public.codegen_circuit_trips(tripped_at desc)
  where reset_at is null;

alter table public.codegen_circuit_trips enable row level security;

-- ═══════════════════════════════════════════════════
-- admin_users — who can access /admin/codegen
-- ═══════════════════════════════════════════════════

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "admin_users_self_read" on public.admin_users;
create policy "admin_users_self_read" on public.admin_users
  for select using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- codegen_global_state — DB-backed kill switch
-- ═══════════════════════════════════════════════════
-- One-row table. Present if the circuit breaker tripped globally or an
-- operator flipped it off from /admin/codegen. The env var
-- CODEGEN_GLOBALLY_ENABLED is the coarse fallback; this table is the
-- fine-grained runtime control.

create table if not exists public.codegen_global_state (
  id int primary key default 1 check (id = 1),
  codegen_globally_enabled boolean not null default true,
  disabled_reason text,
  disabled_at timestamptz,
  disabled_by text,
  updated_at timestamptz not null default now()
);

insert into public.codegen_global_state (id) values (1) on conflict do nothing;

drop trigger if exists trg_codegen_global_state_updated on public.codegen_global_state;
create trigger trg_codegen_global_state_updated
  before update on public.codegen_global_state
  for each row execute function public.update_updated_at();

alter table public.codegen_global_state enable row level security;
-- No public policies. Service role only.

-- ═══════════════════════════════════════════════════
-- Retention: drop codegen_events > 30 days via pg_cron
-- ═══════════════════════════════════════════════════
-- Guarded because local Supabase instances may not have pg_cron. The
-- production project has it enabled; in dev this block just no-ops.

do $$
begin
  if exists (
    select 1 from pg_available_extensions where name = 'pg_cron'
  ) and exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.unschedule('codegen_events_retention')
      from cron.job where jobname = 'codegen_events_retention';
    perform cron.schedule(
      'codegen_events_retention',
      '17 3 * * *',
      $retention$delete from public.codegen_events where created_at < now() - interval '30 days'$retention$
    );
  end if;
end
$$;
