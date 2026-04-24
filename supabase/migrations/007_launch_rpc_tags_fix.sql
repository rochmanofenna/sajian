-- Sajian 007: fix onboarding_launch tags type mismatch
--
-- Migration 003 rewrote onboarding_launch and — in the menu_items insert —
-- sent `coalesce(v_item->'tags', '[]'::jsonb)` into the `tags text[]`
-- column. Postgres raises
--   column "tags" is of type text[] but expression is of type jsonb
-- every time a new native tenant launches. The error comes back as a
-- PostgrestError (not an Error instance), which the old errorResponse
-- swallowed as the generic "Unknown error" banner.
--
-- This migration restores the correct conversion — a text[] built from the
-- jsonb array's elements — without touching the rest of the RPC.
--
-- Re-runnable: `create or replace function`.

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
        -- tags column is text[] — unwrap the jsonb array into text[].
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
      p_draft->>'name',
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

revoke all on function public.onboarding_launch(uuid, text, jsonb) from public;
grant execute on function public.onboarding_launch(uuid, text, jsonb) to service_role;
