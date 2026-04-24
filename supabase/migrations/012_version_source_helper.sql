-- Sajian 012: version-source tagging helper
--
-- Supabase-js can't issue SET LOCAL directly, so the compile API calls
-- this RPC to tag the *next* storefront_sections UPDATE performed in
-- the same connection as source='ai' (or whatever the caller chose).
-- The trigger in migration 010 reads the session variable set here.

create or replace function public.sajian_set_version_source(
  p_source text,
  p_created_by uuid default null,
  p_ai_message_id uuid default null,
  p_parent_version_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('sajian.version_source', coalesce(p_source, 'owner'), true);
  if p_created_by is not null then
    perform set_config('sajian.version_created_by', p_created_by::text, true);
  end if;
  if p_ai_message_id is not null then
    perform set_config('sajian.version_ai_message_id', p_ai_message_id::text, true);
  end if;
  if p_parent_version_id is not null then
    perform set_config('sajian.version_parent_id', p_parent_version_id::text, true);
  end if;
end;
$$;

revoke all on function public.sajian_set_version_source(text, uuid, uuid, uuid) from public;
grant execute on function public.sajian_set_version_source(text, uuid, uuid, uuid) to service_role;
