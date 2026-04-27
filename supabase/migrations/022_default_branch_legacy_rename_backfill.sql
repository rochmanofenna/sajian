-- Sajian 022: catch the legacy stale-rename pattern that 021's
-- backfill missed.
--
-- Migration 021 attempted to NULL the name on default (`code='MAIN'`)
-- branches whose name "still matched" the parent tenant name — the
-- assumed signature of an untouched auto-seeded default. That theory
-- was inverted: the actual stale pattern is the OPPOSITE. The
-- onboarding_launch RPC (pre-021) seeded `branches.name = tenants.name
-- AT LAUNCH TIME`. Later renames (e.g. "Burger Lakeside" →
-- "Sandwicherie Lakeside" via update_name) hit `tenants.name` only,
-- never the branch row. So the stale pattern is:
--
--   b.code = 'MAIN' AND b.name != t.name (current).
--
-- Audit on 2026-04-27 confirmed the only row matching this pattern in
-- prod is Sandwicherie's MAIN branch. Mindiology + Sate Taichan
-- weren't affected (Mindiology is on ESB and never went through the
-- native launch RPC's MAIN-branch seed; Sate Taichan never renamed
-- post-launch).
--
-- Defensive guard — `b.created_at < '2026-04-27 11:00:00+00'`:
-- only branches created BEFORE migration 021 deployed are eligible
-- for backfill. Post-021 launches seed `name=NULL` from the start
-- (the new RPC), so any post-deploy branch whose name differs from
-- its tenant is a DELIBERATE override (e.g. "Pusat", "Cabang Utama",
-- "Headquarters") and must not be touched. We have no such tenants
-- today (audit confirms), but the guard prevents a future "named
-- main branch" intent from being clobbered by a re-run of this
-- migration or a fresh restore.
--
-- Idempotent: once a row is nulled, the next run won't match because
-- `b.name IS NOT NULL` fails. Safe to re-run.

-- Step 1: NULL the stale legacy default-branch names.
update public.branches b
set name = null
where b.code = 'MAIN'
  and b.name is not null
  and b.created_at < timestamp '2026-04-27 11:00:00+00'
  and exists (
    select 1
    from public.tenants t
    where t.id = b.tenant_id
      and t.name <> b.name
  );

-- Step 2: cascade the cleanup to orders.branch_name. Any historical
-- order whose branch_name was snapshotted from a now-nulled MAIN
-- branch should drop the stale string so receipts read clean. We
-- only NULL orders that point at a default (`code='MAIN'`) branch
-- whose name is now NULL — the snapshot is guaranteed stale because
-- the source no longer carries that identity. Multi-branch order
-- snapshots (real branch names like "Citra 8", "Sudirman") are
-- preserved for history.
update public.orders o
set branch_name = null
where o.branch_code = 'MAIN'
  and o.branch_name is not null
  and exists (
    select 1
    from public.branches b
    where b.tenant_id = o.tenant_id
      and b.code = 'MAIN'
      and b.name is null
  );
