-- Sajian Phase 2: auth linkage + onboarding drafts + assets storage
-- Run this AFTER 001_initial_schema.sql.

-- ═══════════════════════════════════════════════════
-- 1. Link tenants to auth.users
-- ═══════════════════════════════════════════════════

alter table public.tenants
  add column if not exists owner_user_id uuid references auth.users(id);

create index if not exists idx_tenants_owner on public.tenants(owner_user_id);

-- RLS: owners can read/update their own tenant even when is_active=false
-- (during onboarding before launch). Phase 1 policies stay — this extends.
drop policy if exists "Owners can read own tenant" on public.tenants;
create policy "Owners can read own tenant"
  on public.tenants for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners can update own tenant" on public.tenants;
create policy "Owners can update own tenant"
  on public.tenants for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- 2. Onboarding drafts
-- ═══════════════════════════════════════════════════
-- One draft per user. The setup page upserts the whole draft as JSON on each
-- meaningful change; the preview route reads it back. When launch succeeds,
-- the draft is deleted.

create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  step text not null default 'welcome',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_drafts_updated before update on public.onboarding_drafts
  for each row execute function public.update_updated_at();

alter table public.onboarding_drafts enable row level security;

create policy "Users read own draft"
  on public.onboarding_drafts for select
  using (user_id = auth.uid());

create policy "Users insert own draft"
  on public.onboarding_drafts for insert
  with check (user_id = auth.uid());

create policy "Users update own draft"
  on public.onboarding_drafts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete own draft"
  on public.onboarding_drafts for delete
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- 3. Atomic tenant launch RPC
-- ═══════════════════════════════════════════════════
-- Takes the final draft JSON, creates tenant + categories + items + branch
-- in one transaction. Rolls back if any insert fails so we never leave a
-- half-built tenant behind.
--
-- Expected draft shape:
-- {
--   "slug": "...", "name": "...", "tagline": "...", "logo_url": "...",
--   "colors": {...}, "operating_hours": {...}, "location": "...",
--   "pos_provider": "sajian_native" | "esb",
--   "esb_config": { "company_code": "...", "branch_code": "...", "bearer_token": "..." },
--   "menu_categories": [
--     { "name": "...", "items": [{ "name": "...", "description": "...", "price": 25000, "tags": [] }] }
--   ]
-- }

create or replace function public.onboarding_launch(
  p_user_id uuid,
  p_phone text,
  p_draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_slug text;
  v_cat jsonb;
  v_cat_id uuid;
  v_item jsonb;
  v_cat_index int := 0;
  v_item_index int;
  v_pos_provider text;
  v_pos_config jsonb;
begin
  v_slug := p_draft->>'slug';
  if v_slug is null or length(v_slug) < 2 then
    raise exception 'slug required';
  end if;
  if exists (select 1 from public.tenants where slug = v_slug) then
    raise exception 'slug taken: %', v_slug using errcode = 'unique_violation';
  end if;

  v_pos_provider := coalesce(p_draft->>'pos_provider', 'sajian_native');
  if v_pos_provider = 'esb' and p_draft ? 'esb_config' then
    v_pos_config := jsonb_build_object(
      'esb_company_code', p_draft->'esb_config'->>'company_code',
      'esb_default_branch', p_draft->'esb_config'->>'branch_code',
      'esb_bearer_token', p_draft->'esb_config'->>'bearer_token',
      'esb_environment', 'production'
    );
  end if;

  insert into public.tenants (
    slug, name, tagline, logo_url, colors,
    support_whatsapp, operating_hours,
    pos_provider, pos_config,
    owner_phone, owner_user_id,
    subscription_tier, is_active
  ) values (
    v_slug,
    p_draft->>'name',
    p_draft->>'tagline',
    p_draft->>'logo_url',
    coalesce(p_draft->'colors', '{
      "primary": "#1B5E3B",
      "accent": "#C9A84C",
      "background": "#FDF6EC",
      "dark": "#1A1A18"
    }'::jsonb),
    p_phone,
    p_draft->'operating_hours',
    v_pos_provider,
    v_pos_config,
    p_phone,
    p_user_id,
    'free',
    true
  )
  returning id into v_tenant_id;

  -- Categories + items
  for v_cat in select * from jsonb_array_elements(coalesce(p_draft->'menu_categories', '[]'::jsonb))
  loop
    insert into public.menu_categories (tenant_id, name, sort_order, is_active)
    values (v_tenant_id, v_cat->>'name', v_cat_index, true)
    returning id into v_cat_id;

    v_item_index := 0;
    for v_item in select * from jsonb_array_elements(coalesce(v_cat->'items', '[]'::jsonb))
    loop
      insert into public.menu_items (
        tenant_id, category_id, name, description, price,
        is_available, sort_order, tags
      ) values (
        v_tenant_id,
        v_cat_id,
        v_item->>'name',
        v_item->>'description',
        coalesce((v_item->>'price')::int, 0),
        coalesce((v_item->>'is_available')::boolean, true),
        v_item_index,
        coalesce(
          array(select jsonb_array_elements_text(v_item->'tags')),
          '{}'::text[]
        )
      );
      v_item_index := v_item_index + 1;
    end loop;

    v_cat_index := v_cat_index + 1;
  end loop;

  -- Default branch for sajian_native tenants. ESB tenants get branches
  -- from the admin flow (which reads ESB's branch list).
  if v_pos_provider = 'sajian_native' then
    insert into public.branches (
      tenant_id, name, code, address,
      supports_dine_in, supports_takeaway, supports_delivery, is_active
    ) values (
      v_tenant_id,
      p_draft->>'name',
      'MAIN',
      p_draft->>'location',
      true, true, false, true
    );
  end if;

  -- Clean up draft
  delete from public.onboarding_drafts where user_id = p_user_id;

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', v_slug
  );
end;
$$;

-- Allow authenticated users to call it — the function checks ownership via p_user_id.
-- Service role calls it from the launch API route with the verified auth uid.
revoke all on function public.onboarding_launch(uuid, text, jsonb) from public;
grant execute on function public.onboarding_launch(uuid, text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════
-- 4. Storage bucket for logos + temp uploads
-- ═══════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

-- Public read — logos are served on the storefront.
drop policy if exists "Public can read assets" on storage.objects;
create policy "Public can read assets"
  on storage.objects for select
  using (bucket_id = 'assets');

-- Authenticated users can upload into their own folder (`user-<uid>/...`)
-- Service role uploads happen from our API routes and bypass RLS, so this
-- policy only matters if we ever let the browser upload directly.
drop policy if exists "Users upload to own folder" on storage.objects;
create policy "Users upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'user-' || auth.uid()::text
  );
