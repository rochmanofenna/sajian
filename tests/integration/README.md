# Integration tests

These run against a real Supabase database (a Pro-tier preview branch
named `test`). They exist to catch regressions that pure-Node vitest
can't see — RLS enforcement, multi-tenant isolation, action handlers
persisting correctly, payment-flow gates.

## Why a separate runner

These tests are **slow** (~2-3 min total) and **stateful** (each suite
seeds + resets the DB). They don't belong in the per-commit `npm test`
loop. Run them on PR open, on push to a PR branch, and nightly.

## Topology

- **Production project**: `cejsweidaxtavpuhsswv` (sajian.app, never
  touched by tests).
- **Test branch**: `test` (managed via `supabase branches`). Persistent
  so the test JWT secret + DB URL stay stable. Schema mirrors prod;
  data is seeded fresh for each test file.

## Files

- `helpers/branch.ts` — resolve the test branch's connection info from
  the Supabase Management API. Cached per process.
- `helpers/clients.ts` — service-role + anon Supabase clients pointed
  at the test branch. Service-role bypasses RLS (admin tests use it);
  anon is what the storefront uses (RLS enforcement tests use it).
- `helpers/seed.ts` — `seedFixtures()` wipes and re-populates every
  tenant-scoped table with the canonical 3-tenant fixture. Idempotent.
- `helpers/auth.ts` — `signInAs(email)` returns an authed Supabase
  client for tenant-isolation tests.
- `fixtures/tenants.ts` — three test tenants: Mindiology Coffee, Sate
  Taichan Uda, and a fresh inactive `test-tenant` for negative cases.
  Each has known-good slug, branches, menu, sections, owners.

## Conventions

- Every test file calls `seedFixtures()` in a top-level `beforeAll`.
  Tests within the file may freely mutate; the next file's `beforeAll`
  resets.
- Never read or write `cejsweidaxtavpuhsswv` (production). The helpers
  enforce this — they refuse to run if the resolved DB URL points at a
  prod-named project.
- Use the smallest fixture surface a test needs. Don't seed a 100-item
  menu when a 2-item menu would prove the same invariant.

## Running locally

```bash
SUPABASE_TEST_BRANCH_REF=djjwszbrlpbdrpwyafmg \
SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase/access-token) \
npm run test:integration
```

The `test:integration` script lives in `package.json` and points
vitest at `vitest.integration.config.ts` (separate config so the
`npm test` loop stays fast).

## CI

Runs on PR + nightly via `.github/workflows/integration.yml`. Required
env: `SUPABASE_TEST_BRANCH_REF`, `SUPABASE_ACCESS_TOKEN`. Both stored
as repo secrets.
