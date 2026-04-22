-- Sajian Phase 1 schema
-- Declaration order: tenants -> branches -> menu_categories -> menu_items -> customers -> orders
-- (spec had orders.customer_id referencing customers before customers was defined)

create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════
-- TENANTS
-- ═══════════════════════════════════════════════════

create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  tagline text,
  logo_url text,

  colors jsonb not null default '{
    "primary": "#1B5E3B",
    "accent": "#C9A84C",
    "background": "#FDF6EC",
    "dark": "#1A1A18"
  }'::jsonb,

  contact_email text,
  support_whatsapp text,

  country_code text not null default '+62',
  currency_symbol text not null default 'Rp ',
  locale text not null default 'id-ID',
  fallback_coords jsonb default '{"lat": -6.28, "lng": 106.71}'::jsonb,

  features jsonb not null default '{
    "reservations": true,
    "delivery": true,
    "cashier_payment": true,
    "member_rewards": true,
    "ai_ordering": false
  }'::jsonb,

  tiers jsonb default '[
    {"name": "Perunggu", "min": 0,   "color": "#CD7F32", "emoji": "🥉"},
    {"name": "Perak",    "min": 200, "color": "#C0C0C0", "emoji": "🥈"},
    {"name": "Emas",     "min": 500, "color": "#D4A843", "emoji": "🥇"}
  ]'::jsonb,
  rewards jsonb default '[]'::jsonb,

  -- pos_provider: 'sajian_native' | 'esb'
  pos_provider text not null default 'sajian_native',
  -- pos_config shape for esb: { esb_company_code, esb_default_branch, esb_bearer_token, esb_environment }
  pos_config jsonb,

  operating_hours jsonb,

  -- subscription_tier: 'free' | 'pro' | 'enterprise'
  subscription_tier text not null default 'free',
  is_active boolean not null default true,

  owner_phone text,
  owner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tenants_slug on public.tenants(slug);
create index idx_tenants_active on public.tenants(is_active) where is_active = true;

-- ═══════════════════════════════════════════════════
-- BRANCHES
-- ═══════════════════════════════════════════════════

create table public.branches (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  name text not null,
  code text not null,
  address text,
  phone text,

  coords jsonb,
  operating_hours jsonb,

  supports_dine_in boolean not null default true,
  supports_takeaway boolean not null default true,
  supports_delivery boolean not null default false,

  is_active boolean not null default true,
  sort_order int not null default 0,

  created_at timestamptz not null default now(),

  unique(tenant_id, code)
);

create index idx_branches_tenant on public.branches(tenant_id);

-- ═══════════════════════════════════════════════════
-- MENU CATEGORIES
-- ═══════════════════════════════════════════════════

create table public.menu_categories (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_categories_tenant on public.menu_categories(tenant_id);

-- ═══════════════════════════════════════════════════
-- MENU ITEMS
-- ═══════════════════════════════════════════════════

create table public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,

  name text not null,
  description text,
  price int not null,
  image_url text,

  -- modifier shape: [{ name, required, multi_select, options: [{ label, price_delta }] }]
  modifiers jsonb default '[]'::jsonb,

  is_available boolean not null default true,
  available_start time,
  available_end time,

  sort_order int not null default 0,
  tags text[] default '{}',

  -- for esb-backed tenants: map sajian items back to esb menu ids
  esb_menu_id text,
  esb_category_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_items_tenant on public.menu_items(tenant_id);
create index idx_items_category on public.menu_items(category_id);
create index idx_items_available on public.menu_items(tenant_id, is_available) where is_available = true;

-- ═══════════════════════════════════════════════════
-- CUSTOMERS (must come before orders — orders.customer_id FK)
-- ═══════════════════════════════════════════════════

create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  phone text not null,
  name text,
  email text,

  points int not null default 0,
  total_orders int not null default 0,
  total_spent int not null default 0,

  esb_member_id text,
  esb_authkey text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(tenant_id, phone)
);

create index idx_customers_tenant on public.customers(tenant_id);
create index idx_customers_phone on public.customers(tenant_id, phone);

-- ═══════════════════════════════════════════════════
-- ORDERS
-- ═══════════════════════════════════════════════════

create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  order_number text not null,

  customer_name text,
  customer_phone text,
  customer_id uuid references public.customers(id) on delete set null,

  -- items snapshot shape: [{ menu_item_id, name, price, quantity, modifiers, notes, image_url }]
  items jsonb not null,

  subtotal int not null,
  tax int not null default 0,
  service_charge int not null default 0,
  discount int not null default 0,
  rounding int not null default 0,
  total int not null,

  -- order_type: 'dine_in' | 'takeaway' | 'delivery'
  order_type text not null,
  table_number text,
  delivery_address text,

  -- payment_method: 'dana' | 'qris' | 'ovo' | 'gopay' | 'cashier'
  payment_method text not null,
  -- payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'expired'
  payment_status text not null default 'pending',
  payment_redirect_url text,
  payment_qr_string text,
  payment_expires_at timestamptz,

  -- esb-backed tenants carry the esb order id once submitted
  esb_order_id text,
  pos_pushed boolean not null default false,

  -- status: 'new' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  status text not null default 'new',

  branch_code text,
  branch_name text,

  customer_notes text,

  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_orders_tenant on public.orders(tenant_id);
create index idx_orders_status on public.orders(tenant_id, status);
create index idx_orders_created on public.orders(tenant_id, created_at desc);
create index idx_orders_customer on public.orders(customer_id) where customer_id is not null;
create index idx_orders_esb on public.orders(esb_order_id) where esb_order_id is not null;

-- ═══════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════

alter table public.tenants enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.customers enable row level security;
alter table public.branches enable row level security;

-- Public read for active tenants (storefront).
-- NOTE: `pos_config` contains encrypted creds — storefront reads should use
-- a dedicated view (v_public_tenants) that strips pos_config. We read full
-- tenant rows only from API routes using the service-role client. Phase 1
-- keeps the RLS read open on tenants to simplify; Phase 2 locks it down.
create policy "Public can read active tenants"
  on public.tenants for select
  using (is_active = true);

create policy "Public can read menu items"
  on public.menu_items for select
  using (
    is_available = true
    and tenant_id in (select id from public.tenants where is_active = true)
  );

create policy "Public can read categories"
  on public.menu_categories for select
  using (
    is_active = true
    and tenant_id in (select id from public.tenants where is_active = true)
  );

create policy "Public can read branches"
  on public.branches for select
  using (
    is_active = true
    and tenant_id in (select id from public.tenants where is_active = true)
  );

-- Phase 1 permissive read. Phase 2 restricts by authenticated customer phone.
create policy "Customers can read orders"
  on public.orders for select
  using (true);

-- ═══════════════════════════════════════════════════
-- FUNCTIONS + TRIGGERS
-- ═══════════════════════════════════════════════════

create or replace function public.generate_order_number(p_tenant_id uuid, p_branch_code text)
returns text
language plpgsql
as $$
declare
  v_count int;
  v_prefix text;
begin
  select count(*) + 1 into v_count
  from public.orders
  where tenant_id = p_tenant_id
    and created_at > date_trunc('day', now());

  v_prefix := coalesce(nullif(p_branch_code, ''), 'ORD');
  return v_prefix || '-' || lpad(v_count::text, 4, '0');
end;
$$;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated before update on public.tenants
  for each row execute function public.update_updated_at();
create trigger trg_items_updated before update on public.menu_items
  for each row execute function public.update_updated_at();
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.update_updated_at();
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.update_updated_at();

-- ═══════════════════════════════════════════════════
-- REALTIME
-- ═══════════════════════════════════════════════════

-- Enable realtime for orders so dashboards see live inserts/updates.
alter publication supabase_realtime add table public.orders;
