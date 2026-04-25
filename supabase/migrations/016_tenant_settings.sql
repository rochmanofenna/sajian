-- Sajian 016: tenant settings columns the AI can edit directly.
--
-- multi_branch_mode lets the owner explicitly pin the storefront to a
-- single-branch experience even when there are multiple rows in
-- branches (e.g. soft-launching a 2nd location without exposing it).
-- Default null = auto-derive from active-branch count at runtime.
--
-- The other columns surfaced here already exist on `tenants`; no
-- migration needed for them. This file is here so future settings
-- expansions land in one place.

alter table public.tenants
  add column if not exists multi_branch_mode boolean;

comment on column public.tenants.multi_branch_mode is
  'null = auto-derive from active-branch count. true = always show picker. false = single-branch UX even with multiple locations.';
