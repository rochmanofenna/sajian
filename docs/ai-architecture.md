# AI architecture — single source of truth

> **TL;DR** Every AI route in Sajian composes its system prompt by importing blocks from `src/lib/ai/system-prompt.ts`. The decision tree, banned phrases, absolute rules, adversarial examples, settings registry, and action catalog live in ONE module. New AI routes register in `scripts/ai-routes.json` and inherit hardening + eval coverage automatically.

## Why this exists

On 2026-04-26 a regression shipped to prod: 5 banned phrases appeared in Fauzan's QA on `/admin` (Sate Taichan Uda's live management chat) — phrases the eval harness had been guarding against for weeks.

Root cause: there were **two AI routes** with **two independently maintained system prompts**.

- `/api/ai/chat` (setup) — hardened. Eval covered it.
- `/api/admin/ai/chat` (live admin) — unhardened. Eval didn't cover it. The route's system prompt was older, was missing log_roadmap_request, and used pre-hardening phrasing.

The architectural fix: collapse the two prompt strings into one composable module. New AI routes inherit hardening for free instead of having to re-paste it. The eval ranges over a registry of routes, not a single endpoint.

## The contract

**Every AI route in Sajian MUST:**

1. Import its system prompt from `buildSystemPrompt(...)` in `src/lib/ai/system-prompt.ts` — never hand-roll a prompt.
2. Register its endpoint in `scripts/ai-routes.json` with a route kind (`setup` | `admin`) and a list of `prompt_sets` to test against.
3. Pass through the eval harness with zero banned-phrase hits (`node scripts/codegen-eval.mjs --route=<name>`).

CI runs `--all` against the registry on every PR that touches `src/lib/ai/**`, `src/app/api/**ai**/**`, the settings registry, the route registry, the eval script, or this doc.

## Module map

```
src/lib/ai/system-prompt.ts        ← single source of truth
├─ STYLE_BLOCK                       universal style guide
├─ DECISION_TREE_BLOCK               9-step request classifier
├─ BANNED_PHRASES                    blocklist (~70 phrases)
├─ ABSOLUTE_RULES_BLOCK              rules 0-8, includes settings registry
├─ ADVERSARIAL_EXAMPLES_BLOCK        ✗/✓ pairs for refusal traps
├─ ACTION_CATALOG                    every action + which surfaces expose it
├─ actionMarkersForRoute(kind, opts) filtered marker list per route
├─ actionResultsBlock(results)       read-back loop
└─ buildSystemPrompt(ctx)            entry point — composes everything

src/app/api/ai/chat/route.ts         setup route — onboarding + re-setup
src/app/api/admin/ai/chat/route.ts   admin route — live management

scripts/ai-routes.json               registry: route name → endpoint + prompt sets
scripts/codegen-eval.mjs             eval harness, accepts --route / --all
```

## How a route composes a prompt

```ts
import { buildSystemPrompt, type PriorActionResult } from '@/lib/ai/system-prompt';

const system = buildSystemPrompt({
  kind: 'admin',                     // determines which actions are exposed
  header: ADMIN_HEADER(tenant.name), // 1-line surface intro
  stateJson: JSON.stringify(state),  // free-form state (draft, live tenant, etc.)
  stateExtras: buildMenuTable(rows), // optional: state-helper text appended after JSON
  goals: ADMIN_GOALS,                // surface-specific guidance bundled at the end
  recentActionResults: body.recent_action_results, // read-back loop
  codegenEnabled: false,             // setup-only flag, gates add_custom_section
});
```

Everything else (decision tree, banned phrases, absolute rules, adversarial examples, action markers) is provided automatically by `buildSystemPrompt()`. A route never re-pastes hardening.

## Adding a new AI route

1. Create the route file. Use `buildSystemPrompt({ kind, header, stateJson, goals, ... })`.
2. Add an entry under `routes` in `scripts/ai-routes.json`:
   ```json
   "newroute": {
     "endpoint": "/api/new-route",
     "kind": "admin",
     "description": "...",
     "request_shape": { "messages": "..." },
     "prompt_sets": ["fauzan_regression", "settings"]
   }
   ```
3. (Optional) Add a route-specific prompt set if the existing ones don't cover its surface.
4. Run `node scripts/codegen-eval.mjs --route=newroute` locally to confirm zero banned-phrase hits.
5. Open PR — CI runs `--all` and posts the scorecard as a comment.

## Adding a new banned phrase

Edit `BANNED_PHRASES` in `src/lib/ai/system-prompt.ts` (and mirror it in `FORBIDDEN_PHRASES` inside `scripts/codegen-eval.mjs` until the eval imports the constant directly). Both sources are scanned; the prompt warning teaches the model to avoid the phrase, the eval blocks the PR if the model emits it.

## Adding a new action

Edit `ACTION_CATALOG` in `src/lib/ai/system-prompt.ts`. Set `availableIn` to `'all'` for cross-surface actions, or a subset like `['setup']` for surface-specific ones. Set `codegenOnly: true` for actions gated behind the per-tenant codegen feature flag. The marker reference in every route's prompt updates automatically on next deploy.

## Eval semantics

A prompt is **green** when:
- HTTP status < 400
- At least one action marker emitted
- Zero banned-phrase hits in the reply
- For roadmap-set prompts: `log_roadmap_request` was called AND the reply contains a bridging phrase (`kamu bisa` / `sementara` / `sambil nunggu` / `untuk sekarang`) followed by a concrete workaround

The eval exits non-zero (CI fails) only if any prompt hit a banned phrase. Action emission misses are logged but not fatal — they often reflect prompt ambiguity rather than regression.

## Regression history

- **2026-04-26** — Fauzan's QA exposed 5 banned phrases on `/admin` chat. Root cause: route divergence; fix landed via this architecture.

## Operator runbook

- **CI eval is yellow / failing**: download `eval-scorecards` artifact from the failed run, find the row(s) with `⚠` in the Forbidden column, and either (a) fix the prompt block in `src/lib/ai/system-prompt.ts` or (b) add a more specific banned-phrase guard.
- **Eval skipped due to missing secrets**: add `AUTH_COOKIE` and `EVAL_TENANT_ID` to GitHub repo secrets. Cookie expires every ~30 days; rotate from devtools when eval starts skipping.
- **Eval is too slow**: scope by editing `paths:` in `.github/workflows/eval.yml` so eval only runs when AI surface files change.
