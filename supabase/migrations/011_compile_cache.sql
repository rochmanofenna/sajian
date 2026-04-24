-- Sajian 011: compile cache
--
-- Second-tier cache for compileSection() output. Keyed by
--   sha256(source_jsx + sanitizer_version + compiler_version)
-- so bumping either version invalidates all entries without a manual
-- flush. The in-process LRU is L1; this table is L2 (shared across
-- Vercel instances and across cold starts).

create table if not exists public.storefront_compile_cache (
  code_hash text primary key,
  compiled_code text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists idx_compile_cache_last_used
  on public.storefront_compile_cache(last_used_at);

-- No RLS policy: writes are service-role only (the compile API), reads
-- are service-role only (never exposed to anon).
alter table public.storefront_compile_cache enable row level security;
