-- Sajian 009: restoreVersion RPC
--
-- Wraps the "set session tags → update section" sequence in a single
-- transaction so the after-update trigger records the new version with
-- source='restore' and parent_version_id pointing at the restored-from
-- version. Supabase-js can't issue SET LOCAL, hence the RPC.

create or replace function public.sajian_restore_section_version(
  p_section_id uuid,
  p_target_version_id uuid,
  p_type text,
  p_variant text,
  p_props jsonb,
  p_sort_order int,
  p_is_visible boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('sajian.version_source', 'restore', true);
  perform set_config('sajian.version_parent_id', p_target_version_id::text, true);

  update public.storefront_sections
    set type = p_type,
        variant = p_variant,
        props = p_props,
        sort_order = p_sort_order,
        is_visible = p_is_visible
    where id = p_section_id;
end;
$$;

revoke all on function public.sajian_restore_section_version(uuid, uuid, text, text, jsonb, int, boolean) from public;
grant execute on function public.sajian_restore_section_version(uuid, uuid, text, text, jsonb, int, boolean) to service_role;
