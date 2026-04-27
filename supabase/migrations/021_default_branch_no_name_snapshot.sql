-- Sajian 021: decouple default-branch name from tenant name
--
-- Bug class: stale tenant identity on customer-facing surfaces. Most
-- recent instance — Sandwicherie Lakeside (formerly named "Burger
-- Lakeside") shipped order receipts reading
--   "#MAIN-0002 / Burger Lakeside"
-- because the launch RPC seeded `branches.name = tenants.name AT
-- LAUNCH TIME`, and later renames of `tenants.name` never propagated
-- to the branch row. `orders.branch_name` is snapshotted from
-- `branches.name` at order-submission time, so the stale name then
-- printed on every receipt.
--
-- Fix: stop coupling default-branch name to the tenant name. Default
-- branches (the auto-created `code='MAIN'` row a single-location
-- restaurant gets at launch) carry name=NULL. Receipt + admin
-- surfaces interpret NULL as "this is THE branch — render only
-- tenant.name, no branch line." Multi-branch tenants set explicit
-- branch names ("Sudirman", "Citra 8") via /admin/locations and those
-- snapshot fine.
--
-- Three parts:
--   1. Drop NOT NULL on branches.name (must come before backfill).
--   2. Backfill: for every code='MAIN' branch whose name still
--      matches its parent tenant's CURRENT name, NULL it out — that's
--      the signature of an untouched default created by an old launch
--      RPC. Manually-renamed branches stay untouched. Also NULLs the
--      orders.branch_name column on existing orders that snapshotted
--      a now-nulled default branch, so receipts read clean
--      retroactively.
--   3. Update onboarding_launch RPC to seed name=NULL going forward.

-- Step 1: drop NOT NULL.
alter table public.branches alter column name drop not null;

-- Step 2a: NULL the matching default branches.
update public.branches b
set name = null
where b.code = 'MAIN'
  and b.name is not null
  and exists (
    select 1
    from public.tenants t
    where t.id = b.tenant_id
      and t.name = b.name
  );

-- Step 2b: clear stale snapshots on existing orders so historical
-- receipts read clean. We only NULL orders that point at a default
-- (code='MAIN') branch whose name is now NULL — i.e. the snapshot is
-- guaranteed stale because the source no longer carries that
-- identity. Multi-branch order snapshots (real branch names) are
-- preserved for history.
update public.orders o
set branch_name = null
where o.branch_code = 'MAIN'
  and o.branch_name is not null
  and exists (
    select 1
    from public.branches b
    where b.tenant_id = o.tenant_id
      and b.code = 'MAIN'
      and b.name is null
  );

-- Step 3: re-create onboarding_launch with name=NULL for the default
-- branch. Body is identical to migration 007 except for the single
-- line that used to pass `p_draft->>'name'` as the branch name.
create or replace function public.onboarding_launch(
  p_user_id uuid,
  p_phone text,
  p_draft jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_slug text;
  v_cat_id uuid;
  v_cat_index int := 0;
  v_item_index int := 0;
  v_cat jsonb;
  v_item jsonb;
  v_pos_provider text;
  v_pos_config jsonb;
  v_theme_template text;
begin
  v_slug := p_draft->>'slug';
  if v_slug is null or v_slug = '' then
    raise exception 'slug missing from draft';
  end if;
  if exists (select 1 from public.tenants where slug = v_slug) then
    raise exception 'slug taken: %', v_slug;
  end if;

  v_pos_provider := coalesce(p_draft->>'pos_provider', 'sajian_native');
  if v_pos_provider = 'esb' and p_draft ? 'esb_config' then
    v_pos_config := jsonb_build_object(
      'esb_company_code', p_draft->'esb_config'->>'company_code',
      'esb_default_branch', p_draft->'esb_config'->>'branch_code',
      'esb_bearer_token', p_draft->'esb_config'->>'bearer_token',
      'esb_environment', coalesce(p_draft->'esb_config'->>'environment', 'production')
    );
  end if;

  v_theme_template := coalesce(p_draft->>'theme_template', 'modern');
  if v_theme_template not in ('kedai', 'warung', 'modern', 'food-hall', 'classic') then
    v_theme_template := 'modern';
  end if;

  insert into public.tenants (
    slug, name, tagline, logo_url, colors,
    support_whatsapp, operating_hours,
    pos_provider, pos_config,
    owner_phone, owner_user_id,
    subscription_tier, is_active,
    theme_template, hero_image_url
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
    true,
    v_theme_template,
    p_draft->>'hero_image_url'
  )
  returning id into v_tenant_id;

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
        is_available, tags, sort_order, image_url
      ) values (
        v_tenant_id,
        v_cat_id,
        v_item->>'name',
        coalesce(v_item->>'description', ''),
        coalesce((v_item->>'price')::int, 0),
        coalesce((v_item->>'is_available')::boolean, true),
        coalesce(
          array(select jsonb_array_elements_text(coalesce(v_item->'tags', '[]'::jsonb))),
          '{}'::text[]
        ),
        v_item_index,
        nullif(v_item->>'image_url', '')
      );
      v_item_index := v_item_index + 1;
    end loop;

    v_cat_index := v_cat_index + 1;
  end loop;

  if v_pos_provider = 'sajian_native' then
    insert into public.branches (
      tenant_id, name, code, address,
      supports_dine_in, supports_takeaway, supports_delivery, is_active
    ) values (
      v_tenant_id,
      null,                       -- default branch carries no name; receipt logic renders tenant.name only.
      'MAIN',
      p_draft->>'location',
      true, true, false, true
    );
  end if;

  delete from public.onboarding_drafts where user_id = p_user_id;

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', v_slug
  );
end;
$$;
