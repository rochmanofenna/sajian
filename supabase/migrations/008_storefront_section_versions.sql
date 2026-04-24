-- Sajian 008: storefront section version history
--
-- Every write to storefront_sections.{type,variant,props,sort_order,is_visible}
-- is mirrored into storefront_section_versions so the owner (or Ryan on
-- their behalf) can roll back when an AI turn produces a bad section.
-- Restoring a previous version is non-destructive — it inserts a NEW
-- version with the content of N, so the history stays append-only.
--
-- Shape:
--   section_id      → the live section this version belongs to (cascades)
--   version_number  → monotonic per section, starts at 1
--   type / variant / props / sort_order / is_visible → snapshot
--   source          → 'ai' | 'owner' | 'system' | 'restore'
--   ai_message_id   → chat turn that produced this version (audit trail)
--   parent_version_id → for restore lineage (v5 restored from v2 → parent=v2.id)

create table if not exists public.storefront_section_versions (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references public.storefront_sections(id) on delete cascade,
  version_number int not null,
  type text not null,
  variant text not null default 'default',
  sort_order int not null default 0,
  props jsonb not null default '{}'::jsonb,
  is_visible boolean not null default true,
  source text not null default 'owner',
  ai_message_id uuid,
  parent_version_id uuid references public.storefront_section_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique(section_id, version_number)
);

create index if not exists idx_section_versions_section_recent
  on public.storefront_section_versions (section_id, created_at desc);
create index if not exists idx_section_versions_ai_message
  on public.storefront_section_versions (ai_message_id)
  where ai_message_id is not null;

alter table public.storefront_sections
  add column if not exists current_version_id uuid
    references public.storefront_section_versions(id) on delete set null;

-- ═══════════════════════════════════════════════════
-- Version recording trigger
-- ═══════════════════════════════════════════════════
-- Fires AFTER INSERT or UPDATE on storefront_sections. Snapshots the new
-- row into storefront_section_versions (version_number bumped per
-- section) and links the section back via current_version_id.
--
-- We skip recording when the only change is current_version_id itself —
-- that's the trigger writing back to the table and would recurse.

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
  -- Guard against self-triggering: when the trigger UPDATEs the source
  -- row to set current_version_id, tg_op='UPDATE' but the rest of the
  -- fields haven't changed. Bail.
  if tg_op = 'UPDATE' then
    if new.type = old.type
       and new.variant = old.variant
       and coalesce(new.props, '{}'::jsonb) = coalesce(old.props, '{}'::jsonb)
       and new.sort_order = old.sort_order
       and new.is_visible = old.is_visible
    then
      return new;
    end if;
  end if;

  -- Pick the version source from a session variable when available so
  -- API routes can tag writes ('ai' from chat turns, 'restore' from the
  -- restore helper). Defaults to 'owner' for direct writes.
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
    is_visible, source, ai_message_id, parent_version_id, created_by
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
    nullif(current_setting('sajian.version_created_by', true), '')::uuid
  )
  returning id into v_new_id;

  -- Update the live row's current_version_id pointer. This fires the
  -- trigger again; the guard block above short-circuits it.
  update public.storefront_sections
    set current_version_id = v_new_id
    where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_sections_record_version on public.storefront_sections;
create trigger trg_sections_record_version
  after insert or update on public.storefront_sections
  for each row execute function public.record_section_version();

-- ═══════════════════════════════════════════════════
-- Backfill: every existing section gets v1 from its current contents
-- ═══════════════════════════════════════════════════

insert into public.storefront_section_versions (
  section_id, version_number, type, variant, sort_order, props,
  is_visible, source, created_at
)
select id, 1, type, variant, sort_order, coalesce(props, '{}'::jsonb),
       is_visible, 'backfill', coalesce(updated_at, created_at, now())
from public.storefront_sections s
where not exists (
  select 1 from public.storefront_section_versions v where v.section_id = s.id
);

update public.storefront_sections s
set current_version_id = v.id
from public.storefront_section_versions v
where v.section_id = s.id
  and v.version_number = 1
  and s.current_version_id is null;

-- ═══════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════

alter table public.storefront_section_versions enable row level security;

drop policy if exists "Owners read own section versions"
  on public.storefront_section_versions;
create policy "Owners read own section versions"
  on public.storefront_section_versions for select
  using (
    section_id in (
      select id from public.storefront_sections
      where tenant_id in (
        select id from public.tenants where owner_user_id = auth.uid()
      )
    )
  );

-- Writes only via service role (the trigger + restoreVersion helper).
-- No INSERT / UPDATE / DELETE policies for anon or authenticated.
