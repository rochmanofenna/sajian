-- Sajian 023: clean orders.branch_name rows that snapshotted the
-- branch_code as a fallback name.
--
-- Post-022 default branches carry name=NULL. The order submit route
-- (src/app/api/order/submit/route.ts) used to fall back
--   branch_name: branchRow.data?.name ?? body.branchCode
-- so a NULL source name caused the literal "MAIN" code to be written
-- into orders.branch_name. The receipt formatter renders that
-- verbatim, leaking an internal identifier onto customer receipts.
--
-- Audit on 2026-04-27 found one such row in prod (Sandwicherie order
-- #MAIN-0003). The companion code fix in this PR replaces the
-- fallback with `?? null` so future orders preserve the NULL signal.
-- This migration NULLs the existing rows.
--
-- Defensive condition: only touch rows where branch_name equals
-- branch_code AND the corresponding default branch carries name=NULL
-- (proving the snapshot was a fallback, not a deliberate name that
-- happens to match the code). Idempotent.

update public.orders o
set branch_name = null
where o.branch_name is not null
  and o.branch_name = o.branch_code
  and exists (
    select 1
    from public.branches b
    where b.tenant_id = o.tenant_id
      and b.code = o.branch_code
      and b.name is null
  );
