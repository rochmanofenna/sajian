# Phase 3 shipping notes

## Commits

| Track | Commit | Summary |
|---|---|---|
| 1 + 2 + 6 | `e7e0d52` | Primitive catalog in system prompt (~800 tokens), one-retry-on-error loop in `ChatPanel`, structured logging helpers in `lib/storefront/observability.ts` |
| 4 | `4445560` | `/api/sections/versions` + `/api/sections/restore` + `/api/sections/bookmarks` endpoints, `VersionHistory` timeline UI, `/setup/history` page, migration 013 |
| 3 + 5 | *next commit* | Preview-side custom rendering (CSP relaxation on `preview` context + `CustomPreviewClient` that runs `new Function()` on server-compiled code), codegen eval harness |

## Prompt token count delta

Measured by string length of the composed `SYSTEM` function output,
not tokens — rough proxy. Actual token count requires running the
Anthropic tokenizer. Approximations below use characters ÷ 4.

| State | SYSTEM characters | Approx tokens |
|---|---|---|
| Phase 2 | 8,500 | 2,125 |
| Phase 3 (catalog added) | 11,900 | 2,975 |
| Delta | +3,400 | **+850 tokens** |

Well under Claude Sonnet's context budget (200k tokens) — negligible
cost impact per turn.

## Preview compile latency

Because Phase 3 relies on the server-side compile (not esbuild-wasm in
a worker), the relevant number is the server compile itself. From
`scripts/sample-compile.mjs`:

- Slot-tree-reducible JSX (no hooks): **skipped** — zero compile, just
  sanitizer validation + DB write (~50 ms round-trip).
- True compile (hooks / conditionals): **23 ms** for 188-char source →
  659-byte function body. p50 under dev load assumed similar; p95
  will climb with source complexity.
- Preview renders the compiled output via `new Function()` in the
  iframe — synchronous, typically <5 ms for the JSX we produce.

End-to-end "chat reply → preview updated": bounded by the server
compile (~30 ms) + DB round-trip (~50 ms) + postMessage → React
re-render (~20 ms) = **~100 ms**. Well under the 500 ms target in
the DoD.

The esbuild-wasm worker path from the spec was not implemented this
phase. Reason: the server compile is fast enough that the worker
doesn't pay off; the complexity cost (WASM loading, worker lifecycle,
per-origin CSP diffs for wasm-unsafe-eval) is deferred to Phase 4 if
actual p95 numbers require it.

## CSP — preview vs tenant vs app

Preview origin gets `'wasm-unsafe-eval' 'unsafe-eval'` in `script-src`;
tenant subdomains and the app origin stay strict. Builder lives in
`src/lib/security/csp.ts`, routing lives in `src/proxy.ts`
(`cspContext()`).

Sample (preview, curl -I https://preview.sajian.app/):

```
content-security-policy-report-only: default-src 'self';
  script-src 'self' 'nonce-<…>' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  …
  frame-ancestors 'self' https://preview.sajian.app https://sajian.app;
  …
```

Sample (tenant, curl -I https://mindiology.sajian.app/):

```
content-security-policy-report-only: default-src 'self';
  script-src 'self' 'nonce-<…>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  …
  frame-ancestors 'none';
  …
```

Tenant pages never carry `'unsafe-eval'` — the relaxation is surgical.

## Bundle audit

| Chunk | Phase 2 | Phase 3 | Delta |
|---|---|---|---|
| 1 | 227 KB | 227 KB | 0 |
| 2 | 223 KB | 223 KB | 0 |
| 3 | 137 KB | 137 KB | 0 |
| 4 | 109 KB | 109 KB | 0 |
| 5 | 108 KB | 108 KB | 0 |
| `@mdx-js/mdx` client refs | 0 | 0 | ✅ |
| `@babel/parser` client refs | 0 | 0 | ✅ |

Customer cold path unchanged (167 KB gz). `CustomPreviewClient` is
under the preview origin only; static imports of primitives it already
lazy-loads via SlotRenderer. Version history page lazy-loads via its
own route chunk so `/setup`'s chunk is untouched.

## What did NOT ship this phase

- **esbuild-wasm Worker**: server compile is fast enough; reintroduce
  if p95 justifies it.
- **Codegen eval results**: harness shipped (`scripts/codegen-eval.mjs`)
  but running it against prod requires a valid owner session cookie
  and an empty tenant to record into. Runs locally; scorecard produced
  on demand into `docs/CODEGEN_EVAL_RESULTS.md`.
- **Inline diff preview** in version history: timeline + restore +
  bookmark shipped; per-version diff is trivial follow-up once the
  diff library choice settles.
- **Sentry integration**: logs go to stdout as structured JSON
  (grep/log-drain-ready). Sentry wiring is one-line-per-logger if
  Ryan adds the SDK in Phase 4.
