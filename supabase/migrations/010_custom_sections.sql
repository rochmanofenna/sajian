-- Sajian 010: custom section type + compile artifacts
--
-- Adds AI-generated JSX as a first-class section type. Custom sections
-- may carry a sanitized slot_tree (Phase 1 AST), a compiled JSX function
-- body (Phase 2), or both. The renderer prefers compiled_code when
-- compile_status='ok', falls back to slot_tree, and finally renders an
-- error-state card.
--
-- Compile artifacts are mirrored onto storefront_section_versions so
-- restoring a previous version brings back the exact compiled output
-- without re-running the compiler.

alter table public.storefront_sections
  add column if not exists source_jsx text,
  add column if not exists slot_tree jsonb,
  add column if not exists compiled_code text,
  add column if not exists code_hash text,
  add column if not exists compile_status text,
  add column if not exists compile_error jsonb,
  add column if not exists compiled_at timestamptz;

alter table public.storefront_section_versions
  add column if not exists source_jsx text,
  add column if not exists slot_tree jsonb,
  add column if not exists compiled_code text,
  add column if not exists code_hash text,
  add column if not exists compile_status text,
  add column if not exists compile_error jsonb,
  add column if not exists compiled_at timestamptz;

-- Drop-and-recreate the trigger function so it copies compile artifacts
-- onto every new version row. The guard block still prevents recursion
-- when the trigger's own update (current_version_id) re-fires the trigger.
create or replace function public.record_section_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version int;
  v_new_id uuid;
  v_source text;
begin
  if tg_op = 'UPDATE' then
    if new.type = old.type
       and new.variant = old.variant
       and coalesce(new.props, '{}'::jsonb) = coalesce(old.props, '{}'::jsonb)
       and new.sort_order = old.sort_order
       and new.is_visible = old.is_visible
       and coalesce(new.source_jsx, '') = coalesce(old.source_jsx, '')
       and coalesce(new.slot_tree, '{}'::jsonb) = coalesce(old.slot_tree, '{}'::jsonb)
       and coalesce(new.compiled_code, '') = coalesce(old.compiled_code, '')
       and coalesce(new.code_hash, '') = coalesce(old.code_hash, '')
       and coalesce(new.compile_status, '') = coalesce(old.compile_status, '')
    then
      return new;
    end if;
  end if;

  v_source := coalesce(
    nullif(current_setting('sajian.version_source', true), ''),
    'owner'
  );

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.storefront_section_versions
    where section_id = new.id;

  insert into public.storefront_section_versions (
    section_id, version_number, type, variant, sort_order, props,
    is_visible, source, ai_message_id, parent_version_id, created_by,
    source_jsx, slot_tree, compiled_code, code_hash, compile_status,
    compile_error, compiled_at
  )
  values (
    new.id,
    v_next_version,
    new.type,
    new.variant,
    new.sort_order,
    coalesce(new.props, '{}'::jsonb),
    new.is_visible,
    v_source,
    nullif(current_setting('sajian.version_ai_message_id', true), '')::uuid,
    nullif(current_setting('sajian.version_parent_id', true), '')::uuid,
    nullif(current_setting('sajian.version_created_by', true), '')::uuid,
    new.source_jsx,
    new.slot_tree,
    new.compiled_code,
    new.code_hash,
    new.compile_status,
    new.compile_error,
    new.compiled_at
  )
  returning id into v_new_id;

  update public.storefront_sections
    set current_version_id = v_new_id
    where id = new.id;

  return new;
end;
$$;

-- Fast lookup: custom sections for a tenant. Partial index keeps it
-- small since the vast majority of rows won't be type='custom'.
create index if not exists idx_sections_custom_by_tenant
  on public.storefront_sections(tenant_id)
  where type = 'custom';
