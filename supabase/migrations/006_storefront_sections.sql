-- Sajian Phase 3: storefront_sections
--
-- Section-based storefront composition. Each tenant's home page is a stack
-- of sections (hero, about, gallery, etc.) the AI can add / reorder / swap
-- variants on via chat. Legacy tenants keep `theme_template` as a fallback
-- until they're migrated — the Next.js layer checks this table first and
-- falls back when empty.
--
-- Shape:
--   tenant_id    → the tenant these sections belong to
--   type         → 'hero' | 'about' | 'featured_items' | 'gallery' | 'promo' | 'contact'
--   variant      → per-type discriminator (e.g. 'split' | 'minimal' | 'gradient')
--   sort_order   → render order (ascending)
--   props        → section-specific config (image urls, testimonials, copy)
--   is_visible   → soft-hide without losing the config

create table if not exists public.storefront_sections (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  variant text not null default 'default',
  sort_order int not null default 0,
  props jsonb not null default '{}'::jsonb,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sections_tenant on public.storefront_sections(tenant_id);
create index if not exists idx_sections_tenant_order
  on public.storefront_sections(tenant_id, sort_order);

drop trigger if exists trg_sections_updated on public.storefront_sections;
create trigger trg_sections_updated before update on public.storefront_sections
  for each row execute function public.update_updated_at();

alter table public.storefront_sections enable row level security;

-- Public can read visible sections for active tenants (storefront rendering).
drop policy if exists "Public can read storefront sections" on public.storefront_sections;
create policy "Public can read storefront sections"
  on public.storefront_sections for select
  using (
    is_visible = true
    and tenant_id in (select id from public.tenants where is_active = true)
  );

-- Owners can read + write their own sections (the admin UI will use this).
drop policy if exists "Owners read own sections" on public.storefront_sections;
create policy "Owners read own sections"
  on public.storefront_sections for select
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

drop policy if exists "Owners insert own sections" on public.storefront_sections;
create policy "Owners insert own sections"
  on public.storefront_sections for insert
  with check (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

drop policy if exists "Owners update own sections" on public.storefront_sections;
create policy "Owners update own sections"
  on public.storefront_sections for update
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()))
  with check (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

drop policy if exists "Owners delete own sections" on public.storefront_sections;
create policy "Owners delete own sections"
  on public.storefront_sections for delete
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));
