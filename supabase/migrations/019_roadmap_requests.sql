-- Sajian 019: roadmap_requests — the third response pattern.
--
-- Tenants ask for things that genuinely don't exist yet (modifiers,
-- loyalty points, reservations, subscriptions). The AI now logs each
-- request with a category + workaround offered, instead of either
-- (a) hallucinating it'll build it or (b) using banned refusal
-- phrases. Aggregated rows feed /admin/roadmap so the team can
-- prioritize features by real demand.

create table if not exists public.roadmap_requests (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  -- The owner / operator who asked. May be null when the AI
  -- categorizes a request before login state is known (e.g.
  -- pre-launch onboarding).
  requester_user_id uuid references auth.users(id) on delete set null,
  raw_user_message text not null,
  ai_categorization text not null check (
    ai_categorization in (
      'modifiers',
      'loyalty',
      'reservations',
      'gift_cards',
      'subscriptions',
      'multi_currency',
      'inventory',
      'integrations',
      'other'
    )
  ),
  workaround_offered text,
  -- Repeated requests with identical (tenant_id, ai_categorization,
  -- normalized message) bump this counter instead of inserting a
  -- second row. The AI doesn't enforce this — the executor merges
  -- on insert by checking for an open row in the same bucket.
  upvote_count integer not null default 1,
  status text not null default 'open' check (
    status in ('open', 'planned', 'in_progress', 'shipped', 'wont_do')
  ),
  resolved_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roadmap_tenant_status
  on public.roadmap_requests(tenant_id, status);
create index if not exists idx_roadmap_category_status
  on public.roadmap_requests(ai_categorization, status);
create index if not exists idx_roadmap_open_recent
  on public.roadmap_requests(created_at desc)
  where status = 'open';

drop trigger if exists trg_roadmap_updated on public.roadmap_requests;
create trigger trg_roadmap_updated before update on public.roadmap_requests
  for each row execute function public.update_updated_at();

alter table public.roadmap_requests enable row level security;

-- Owners can read + insert their own tenant's requests.
drop policy if exists "roadmap_owner_read" on public.roadmap_requests;
create policy "roadmap_owner_read" on public.roadmap_requests
  for select using (
    tenant_id in (select id from public.tenants where owner_user_id = auth.uid())
  );

-- Sajian operators (admin_users table) read all rows.
drop policy if exists "roadmap_admin_read" on public.roadmap_requests;
create policy "roadmap_admin_read" on public.roadmap_requests
  for select using (
    auth.uid() in (select user_id from public.admin_users)
  );

-- Writes go through service role only — the AI executor + admin
-- status updates are the only legitimate write paths.
