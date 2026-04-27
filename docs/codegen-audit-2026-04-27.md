# Codegen quality audit — 2026-04-27

> **Status:** Layer 1.5, 1.1, and 1.3 shipped pre-launch (component-only fixes). Remaining Layer 1 work (1.2, 1.4, 1.6, 1.7, 1.8) deferred to the May 1-3 architectural review block. Layer 2 + Layer 3 deferred to May/June.

## Vertical rhythm scale (Layer 1.3 — locked 2026-04-27)

Every top-level `<section>` (or its outer `<div>` wrapper) in `src/components/storefront/sections/*.tsx` MUST use one of these padding values:

| Token | Value | Use |
|---|---|---|
| **default** | `py-16` | Default for all sections (Hero/Gradient, Hero/Minimal, Hero/Split, Hero/Editorial, Gallery all variants, Promo all variants, Featured all variants, About all variants, Contact all variants, Testimonials all variants, Location, Social all variants, CustomSection fallback) |
| **cinematic** | `py-24 md:py-32` | Hero/Fullscreen variant only (deliberate cinematic statement, responsive 96px → 128px) |
| **tight** | `py-12` | Reserved for sections that should NOT compete for breathing room — footer-adjacent CTA strips, attached neighbors. Use sparingly; do not introduce without a clear reason. |

### What stays inside, NOT on the scale

These are intentional inner-surface or special-purpose paddings, not section vertical rhythm. Do not normalize them:

- Inner card paddings inside a section (e.g. `rounded-3xl px-6 py-8`, `max-w-md mx-auto rounded-3xl px-5 py-6`) — these treat a card as a surface within the section's vertical space
- Floating chip / fixed-position elements (e.g. `fixed z-30 max-w-xs rounded-2xl px-4 py-4`) — sized to be unobtrusive, not laid out by section rhythm
- Sticky thin bars (e.g. `sticky top-0 z-20 px-4 py-2` for `Announcement`) — height is the whole point, padding is functional
- Split-section overlap patterns (`pb-8 -mt-4`, `pb-10 -mt-4` in `FeaturedItems` and `About` `aside_slot` wrappers) — deliberate visual continuity between halves of one logical section, not two stacked sections

### Why this exists

Pre-Layer-1.3 audit found 5 different `py-N` values across hero variants alone (`py-10`, `py-14`, `py-20`, `py-24 md:py-32`) and several more across other sections (`py-10`, `py-12`). Each section author had picked their own number. The result on Sandwicherie's preview was that the page read as "a stack of strangers" — no shared vertical rhythm, sections felt like independently-styled fragments rather than parts of one storefront. Collapsing to a 3-token scale gives every page a consistent visual cadence.

### Adding a new section

When you author a new `src/components/storefront/sections/Foo.tsx`:
1. Top-level wrapper uses `px-6 py-16` unless you have a specific reason to deviate
2. Add a header comment referencing this doc
3. Inner card / floating / overlap paddings stay free-form — they're not the section's vertical rhythm

### Migrating an existing section

If you need to change one to a non-default value, update this table. Don't introduce a new value silently.

## Companion fixes shipped same week

- **Layer 1.5** — Hero Lockup responsive (`Hero.tsx`): logo + name stacks vertically on viewports `<480px`, reflows to a row at `≥480px`. Long names like "Sandwicherie Lakeside" no longer clip on narrow phones.
- **Layer 1.1** — Gallery clean-grid count→layout map (`Gallery.tsx`): `galleryGridLayout(count)` trims to the nearest count that fills a clean rectangular grid + picks columns to match. 4 photos render as 2×2 (was 3+1 orphan), 5 trims to 4, 7 trims to 6, etc. 12 unit tests pin the contract.

## Deferred Layer 1 work (May 1-3 architectural review)

| Layer | Description | Cost |
|---|---|---|
| L1.2 | Spacing tokens — replace `stack.gap`, `box.padding`, `box.margin` ranges with discrete enums {none, xs, sm, md, lg, xl, 2xl} mapping to {0, 4, 8, 12, 16, 24, 32, 48} px. SafeStyle validator rejects free px values outside the token set. | 3-4 hrs |
| L1.4 | Tenant-color enforcement — `box.background` and SafeStyle background/color validators accept either a CSS var reference (`var(--color-primary)` etc) or a tenant-token reference, reject literal hex/rgba unless explicitly opted-in. | 2-3 hrs |
| L1.6 | Border-radius token enum {none, sm, md, lg, full} mapping to {0, 4, 8, 16, 9999}. Replace `border_radius: [0, 9999]` range. | 1 hr |
| L1.7 | Box width/height: drop from primitive-catalog or replace with {auto, full, half, third} enum. Width/height as explicit pixels is almost always wrong on responsive. | 1 hr |
| L1.8 | Typography scale — text size tokens {body, lead, small, micro, h1, h2, h3, h4} mapping to consistent font-size + line-height per tenant theme. Replace ad-hoc text-3xl / text-base / text-sm with tokens. | 3-4 hrs |

Each of these requires schema + prompt + sanitizer changes. They can regress existing tenants if done carelessly — that's why they're not pre-launch work.

## Layer 2 (post-launch, May)

Visual regression checks via Playwright headless + rule-based scoring. Wire into `scripts/codegen-eval.mjs` scorecard. Catches structural alignment / orphan-row / contrast issues automatically.

## Layer 3 (post-launch, June)

Vision-model review: send rendered storefront screenshot to Claude vision with a "score 1-5 on visual quality" prompt; auto-regenerate sections that fall below threshold. Combined with style-direction system (the BIG unlock — coherent palette/type/animation per "vibe").
