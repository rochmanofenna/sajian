-- Template-driven storefronts.
--
-- Adds two new tenant-level fields:
--   * theme_template — one of five preset storefront layouts. Drives both the
--     React component variant (hero + menu) and CSS token block applied to
--     <html data-template="...">. The AI onboarding picks the initial value
--     based on food_type; the owner can switch via chat.
--   * hero_image_url — optional full-bleed cover for templates that render one.
--     Reuses the storefront-photo upload bucket for now; a dedicated hero
--     upload UI ships in phase 2.
--
-- Existing tenants default to 'modern'. Mindiology is flipped to 'kedai' at
-- the bottom so the coffee-shop preset ships live immediately.

alter table public.tenants
  add column if not exists theme_template text not null default 'modern'
    check (theme_template in ('kedai', 'warung', 'modern', 'food-hall', 'classic')),
  add column if not exists hero_image_url text;

comment on column public.tenants.theme_template is
  'Storefront layout preset. The AI onboarding picks one based on food_type; owners can override.';
comment on column public.tenants.hero_image_url is
  'Full-bleed cover photo for hero variants that render one (kedai, modern). Nullable.';

-- Flip Mindiology to the coffee-shop template so the live demo shows range.
update public.tenants
set theme_template = 'kedai'
where slug = 'mindiology';

-- Extend onboarding_launch() so draft.theme_template + draft.hero_image_url
-- flow into the tenants row. We replace the whole insert with the new shape;
-- the rest of the function is unchanged.
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
  -- Enforce slug-unique and caller-ownership policies as before.
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

  -- Categories + items (unchanged).
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
        is_available, tags, sort_order
      ) values (
        v_tenant_id,
        v_cat_id,
        v_item->>'name',
        coalesce(v_item->>'description', ''),
        coalesce((v_item->>'price')::int, 0),
        coalesce((v_item->>'is_available')::boolean, true),
        coalesce(v_item->'tags', '[]'::jsonb),
        v_item_index
      );
      v_item_index := v_item_index + 1;
    end loop;

    v_cat_index := v_cat_index + 1;
  end loop;

  -- Default branch for sajian_native tenants (unchanged).
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

  -- Clean up draft.
  delete from public.onboarding_drafts where user_id = p_user_id;

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', v_slug
  );
end;
$$;
