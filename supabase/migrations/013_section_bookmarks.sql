-- Sajian 013: named version bookmarks
--
-- Owners can pin a specific storefront_section_version ("Sebelum promo
-- lebaran") so it floats to the top of the history timeline. The
-- version itself stays append-only; this table is just a named pointer.

create table if not exists public.storefront_section_bookmarks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version_id uuid not null references public.storefront_section_versions(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(version_id)
);

create index if not exists idx_section_bookmarks_tenant_recent
  on public.storefront_section_bookmarks(tenant_id, created_at desc);

alter table public.storefront_section_bookmarks enable row level security;

drop policy if exists "Owners read own bookmarks" on public.storefront_section_bookmarks;
create policy "Owners read own bookmarks"
  on public.storefront_section_bookmarks for select
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

drop policy if exists "Owners insert own bookmarks" on public.storefront_section_bookmarks;
create policy "Owners insert own bookmarks"
  on public.storefront_section_bookmarks for insert
  with check (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));

drop policy if exists "Owners delete own bookmarks" on public.storefront_section_bookmarks;
create policy "Owners delete own bookmarks"
  on public.storefront_section_bookmarks for delete
  using (tenant_id in (select id from public.tenants where owner_user_id = auth.uid()));
