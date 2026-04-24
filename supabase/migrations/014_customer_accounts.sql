-- Sajian 014: global customer accounts
--
-- Prior schema had `public.customers` as a per-tenant record (tenant_id,
-- phone, counters). That's preserved as the junction — one row per
-- (tenant, customer) with total_orders / total_spent / first_order_at /
-- last_order_at. What's new: a global `customer_accounts` table tied to
-- Supabase Auth so the same email logs into every tenant with one
-- identity.
--
--   customer_accounts  (1 per person)
--         │
--         │ 1-to-many via customer_account_id
--         ▼
--   customers          (1 per person-per-tenant — existing table)
--         │
--         │ 1-to-many via customer_id
--         ▼
--   orders             (customer_id links to per-tenant row;
--                       guest_contact populated when customer_id null)
--
-- Guest orders continue to land with customer_id=null; logged-in orders
-- populate BOTH customer_id (per-tenant row) and the linkage up to
-- customer_accounts via customers.customer_account_id.

create table if not exists public.customer_accounts (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null check (email = lower(email)),
  phone text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_accounts_auth_user
  on public.customer_accounts(auth_user_id)
  where auth_user_id is not null;

drop trigger if exists trg_customer_accounts_updated on public.customer_accounts;
create trigger trg_customer_accounts_updated before update on public.customer_accounts
  for each row execute function public.update_updated_at();

-- Per-tenant customer profile rows gain a pointer up to the global
-- account + storage for saved checkout addresses + timestamps the spec
-- expected under the customer_tenants junction shape.
alter table public.customers
  add column if not exists customer_account_id uuid references public.customer_accounts(id) on delete set null,
  add column if not exists saved_addresses jsonb not null default '[]'::jsonb,
  add column if not exists first_order_at timestamptz,
  add column if not exists last_order_at timestamptz;

create index if not exists idx_customers_account on public.customers(customer_account_id)
  where customer_account_id is not null;

-- Guest-order contact payload for orders that were placed without a
-- customer session. Shape: {email, phone, name}. Populated ONLY when
-- orders.customer_id is null so logged-in orders don't carry redundant
-- copies of their own email.
alter table public.orders
  add column if not exists guest_contact jsonb;

create index if not exists idx_orders_guest_email
  on public.orders ((guest_contact->>'email'))
  where customer_id is null;

-- ═══════════════════════════════════════════════════
-- RLS — customer_accounts
-- ═══════════════════════════════════════════════════
alter table public.customer_accounts enable row level security;

-- Customer reads/updates their own profile.
drop policy if exists "customer_accounts_self_read" on public.customer_accounts;
create policy "customer_accounts_self_read" on public.customer_accounts
  for select using (auth.uid() = auth_user_id);

drop policy if exists "customer_accounts_self_update" on public.customer_accounts;
create policy "customer_accounts_self_update" on public.customer_accounts
  for update using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Writes (create account, link auth_user_id) happen through service role
-- only. No INSERT policy for anon / authenticated.

-- ═══════════════════════════════════════════════════
-- RLS — customers (extend existing policies)
-- ═══════════════════════════════════════════════════

-- The authenticated customer can read their own per-tenant profile.
drop policy if exists "customers_self_read" on public.customers;
create policy "customers_self_read" on public.customers
  for select using (
    customer_account_id in (
      select id from public.customer_accounts where auth_user_id = auth.uid()
    )
  );

-- They can update saved_addresses / name / phone on their own rows.
drop policy if exists "customers_self_update" on public.customers;
create policy "customers_self_update" on public.customers
  for update using (
    customer_account_id in (
      select id from public.customer_accounts where auth_user_id = auth.uid()
    )
  )
  with check (
    customer_account_id in (
      select id from public.customer_accounts where auth_user_id = auth.uid()
    )
  );

-- Tenant owners can read customers of their own tenant (for future
-- marketing UI; no write privilege).
drop policy if exists "customers_owner_read" on public.customers;
create policy "customers_owner_read" on public.customers
  for select using (
    tenant_id in (select id from public.tenants where owner_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════
-- Helper RPC: link_or_create_customer_account
-- ═══════════════════════════════════════════════════
-- Called by the verify-otp handler. Service-role only. Given an auth
-- user id + email, either:
--   * finds an existing customer_accounts row by auth_user_id and
--     returns it, OR
--   * finds an existing row by email (from a prior guest contact) and
--     fills in auth_user_id, OR
--   * inserts a new row.
-- Idempotent — safe to call on every sign-in.

create or replace function public.link_or_create_customer_account(
  p_auth_user_id uuid,
  p_email text,
  p_phone text default null,
  p_name text default null
) returns public.customer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.customer_accounts;
  v_lower_email text;
begin
  v_lower_email := lower(trim(p_email));
  if v_lower_email is null or v_lower_email = '' then
    raise exception 'email required';
  end if;

  select * into v_row from public.customer_accounts
    where auth_user_id = p_auth_user_id
    limit 1;
  if found then
    return v_row;
  end if;

  select * into v_row from public.customer_accounts
    where email = v_lower_email
    limit 1;
  if found then
    update public.customer_accounts
      set auth_user_id = p_auth_user_id,
          phone = coalesce(v_row.phone, p_phone),
          name = coalesce(v_row.name, p_name)
      where id = v_row.id
      returning * into v_row;
    return v_row;
  end if;

  insert into public.customer_accounts (auth_user_id, email, phone, name)
  values (p_auth_user_id, v_lower_email, p_phone, p_name)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.link_or_create_customer_account(uuid, text, text, text) from public;
grant execute on function public.link_or_create_customer_account(uuid, text, text, text) to service_role;

-- ═══════════════════════════════════════════════════
-- Helper RPC: link_guest_orders_to_account
-- ═══════════════════════════════════════════════════
-- After a guest customer signs up post-checkout, migrate any orders
-- still tagged with guest_contact.email = their email into proper
-- customer_id linkage. Runs on a single tenant at a time because the
-- per-tenant customers row is what orders.customer_id references.

create or replace function public.link_guest_orders_to_account(
  p_account_id uuid,
  p_tenant_id uuid,
  p_email text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_updated int := 0;
  v_email text;
begin
  v_email := lower(trim(p_email));

  -- Ensure a per-tenant customers row exists linked to this account.
  -- The classic path: the customers row was created during the guest
  -- order via .upsert(tenant_id, phone); reuse it by updating with the
  -- account pointer. If no row exists (shouldn't happen for a real
  -- guest order but keep it defensive), create one.
  select id into v_customer_id from public.customers
    where tenant_id = p_tenant_id
      and (customer_account_id = p_account_id or lower(coalesce(email, '')) = v_email)
    limit 1;

  if v_customer_id is null then
    insert into public.customers (tenant_id, email, customer_account_id)
    values (p_tenant_id, v_email, p_account_id)
    returning id into v_customer_id;
  else
    update public.customers
      set customer_account_id = p_account_id,
          email = coalesce(email, v_email)
      where id = v_customer_id;
  end if;

  update public.orders
    set customer_id = v_customer_id,
        guest_contact = null
    where tenant_id = p_tenant_id
      and customer_id is null
      and lower(coalesce(guest_contact->>'email', '')) = v_email;
  get diagnostics v_updated = row_count;

  -- Back-fill counters so the customers row reflects reality.
  update public.customers c
    set total_orders = (
          select count(*) from public.orders o
          where o.customer_id = c.id
        ),
        total_spent = (
          select coalesce(sum(total), 0) from public.orders o
          where o.customer_id = c.id
        ),
        first_order_at = (
          select min(created_at) from public.orders o
          where o.customer_id = c.id
        ),
        last_order_at = (
          select max(created_at) from public.orders o
          where o.customer_id = c.id
        )
    where c.id = v_customer_id;

  return v_updated;
end;
$$;

revoke all on function public.link_guest_orders_to_account(uuid, uuid, text) from public;
grant execute on function public.link_guest_orders_to_account(uuid, uuid, text) to service_role;
