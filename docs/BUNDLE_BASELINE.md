# Bundle baseline — Phase 0 snapshot (Phase 1 delta tracked below)

Captured immediately after Phase 0 landed. This is the regression gate
for every subsequent codegen phase. A customer-path increase > 10% in
any single chunk, or any new entry in the "dangerous bleed" table
below, should block the PR.

## How to reproduce

```bash
rm -rf .next
npm run build
du -sh .next/static/chunks
du -b .next/static/chunks/*.js | sort -rn | head -10
du -b .next/static/chunks/*.css
```

## Global stats (post-Phase 0)

| Metric | Value |
|---|---|
| `.next/static/chunks` total | **1.4 MB** (uncompressed) |
| `.next/server/app` total | 2.3 MB (not served to customers) |
| Stack | Next 16.2.4, React 19.2.4, Tailwind v4, RSC on, all routes Dynamic (`ƒ`) |

## Top 10 client JS chunks

| Raw KB | Gzipped KB (est.) | Chunk |
|---|---|---|
| 227 | 70 | `12simlrcfk3g2.js` — framework / react core |
| 223 | 59 | `07gskduul.o1c.js` — framework / RSC runtime |
| 137 | 37 | `0vjl2odh~7nce.js` — likely app router + supabase-ssr |
| 109 | 38 | `03~yq9q893hmn.js` — likely UI dep cluster |
| 76 | 22 | `01jsgarc3xjd5.js` |
| 58 | — | `0rq6iejhfmwfm.js` |
| 53 | — | `0d3shmwh5_nmn.js` |
| 43 | — | `0mu1qslb0zv9i.js` |
| 38 | — | `0o1vzgxjcx2rv.js` |
| 32 | — | `06~~_fpcjra-w.js` |

Rough customer-cold-path ceiling: the two largest framework chunks + the
app-router chunk = **~450 KB raw / ~170 KB gzipped** that every first
customer hits before any tenant-specific content loads.

## CSS

| Raw KB | File | Notes |
|---|---|---|
| 104 | `025e_9nqt2vki.css` | tailwind runtime + sections + onboarding tokens |
| 4 | `0qtyb0~n1lioe.css` | small secondary chunk |

## Dangerous-bleed audit (customer-path)

Customer routes (`/`, `/menu`, `/cart`, `/checkout`, `/track/[id]`) must
NEVER ship these server-only deps to the browser. Checked via
`grep -l <pkg> .next/static/chunks/*.js`:

| Package | Expected | Actual |
|---|---|---|
| `@anthropic-ai/sdk` | 0 | **0** ✅ |
| `openai` | 0 | **0** ✅ |
| `xendit-node` | 0 | **0** ✅ |
| `sharp` | 0 | **0** ✅ |
| `zustand` | allowed (cart) | 1 chunk references it — intentional, `src/lib/cart/store.ts` powers `CartView` / `CartButton` / `CheckoutView` / `BranchPicker` / `MenuOverlay` |

## Customer-path dependency list (intentional)

What customer routes legitimately ship:

- `next` + `react` + `react-dom` — framework
- `@supabase/ssr` + `@supabase/supabase-js` — auth session refresh + client-side order submit
- `zustand` — cart state
- `lucide-react` — only the icons actually used on storefront are tree-shaken in
- `tailwind-merge` + `clsx` — class composition
- `tailwindcss` runtime (CSS only, no JS)
- Inline section components from `src/components/storefront/sections/*.tsx`

What customer routes must NEVER ship:

- Any AI SDK (Anthropic, OpenAI)
- Any image processing (Sharp)
- Any payment SDK (Xendit)
- Any onboarding / admin code (the setup flow, admin panels, Anthropic prompts)
- Any JSX / JS compiler (future codegen: the server must compile, not the client)

## Non-goals for Phase 0

Phase 0 is substrate. No customer-visible change was expected. This
baseline is the "before" photo — Phase 1+ commits should reference
these numbers when justifying any client-code additions.

## Regression gate (Phase 1+)

For each client-facing PR:

1. `npm run build`
2. `du -sh .next/static/chunks` — total uncompressed should stay under **1.6 MB**
3. `du -b .next/static/chunks/*.js | sort -rn | head -10` — the 4 largest chunks should move by <10% unless there's an explicit reason
4. Re-run the dangerous-bleed grep; the 0-entries must stay 0

If a codegen phase needs to ship more code to the customer (unlikely,
since the AST renderer is stateless), justify explicitly in the PR and
update this file with the new floor.

## Phase 1 delta (primitives + sanitizer + expression language)

Measured after the commit that added framer-motion + jsep, with
Motion / Countdown / Scheduled / TimeOfDay lazy-loaded from
SlotRenderer so framer-motion doesn't enter the customer cold path.

| Metric | Phase 0 | Phase 1 | Delta |
|---|---|---|---|
| Total chunks dir | 1.4 MB | 1.6 MB | +200 KB (framer-motion on disk) |
| Top-4 chunks raw | 696 KB | 696 KB | **0 KB** (unchanged) |
| Top-4 chunks gz  | 204 KB | 204 KB | **0 KB** (unchanged) |
| Customer cold path (top 3 framework/app chunks) | ~559 KB raw / 167 KB gz | ~559 KB raw / 167 KB gz | unchanged |
| `framer-motion` on customer cold path | n/a | **not present** ✅ | lazy chunk only loaded when a Motion node actually renders |

### Verification commands

```bash
du -b .next/static/chunks/*.js | sort -rn | head -5
# Should match Phase 0's top 4 — a fifth chunk may shuffle but no
# framer-motion chunk should appear in the top 5.

grep -l "framer-motion" .next/static/chunks/*.js | wc -l
# Expect >= 1 (the lazy chunk is emitted). If zero, verify SlotRenderer
# still uses lazy() + Suspense for Motion.
```
