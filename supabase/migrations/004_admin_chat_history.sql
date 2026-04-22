-- Sajian Phase 2.5: admin chat history
--
-- Per-(tenant, user) chat transcript for the /admin AI tab. Persisting to
-- Supabase means the conversation survives browser clears, device swaps, or
-- new incognito sessions — localStorage alone is a cache, not a source of
-- truth. Each owner's chat is private to them; co-owners in future would get
-- their own transcript on the same tenant.

create table if not exists public.admin_chat_history (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists idx_admin_chat_history_updated
  on public.admin_chat_history (user_id, updated_at desc);

alter table public.admin_chat_history enable row level security;

drop policy if exists "Owner reads own admin chat" on public.admin_chat_history;
create policy "Owner reads own admin chat"
  on public.admin_chat_history for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owner inserts own admin chat" on public.admin_chat_history;
create policy "Owner inserts own admin chat"
  on public.admin_chat_history for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owner updates own admin chat" on public.admin_chat_history;
create policy "Owner updates own admin chat"
  on public.admin_chat_history for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Owner deletes own admin chat" on public.admin_chat_history;
create policy "Owner deletes own admin chat"
  on public.admin_chat_history for delete
  using (user_id = auth.uid());

-- updated_at trigger — reuses function from migration 001.
drop trigger if exists trg_admin_chat_history_updated on public.admin_chat_history;
create trigger trg_admin_chat_history_updated before update on public.admin_chat_history
  for each row execute function public.update_updated_at();
