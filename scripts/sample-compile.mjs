// Phase-2 dogfood script — runs one compile end-to-end without hitting
// the HTTP API. Prints source length, compiled length, and elapsed ms.
// Usage: node scripts/sample-compile.mjs

import { compile as mdxCompile } from '@mdx-js/mdx';

const source = `
<Motion enter="slide-up" hover="lift">
  <Overlay anchor="bottom-right" offset_x={24} offset_y={24}>
    <Button content="Pesan Sekarang" href="/menu" size="md" />
  </Overlay>
</Motion>
`;

const wrapped = `
export default function Section(props) {
  return (${source})
}
`;

const start = Date.now();
const compiled = await mdxCompile(wrapped, {
  outputFormat: 'function-body',
  development: false,
});
const ms = Date.now() - start;

const out = String(compiled);
console.log(JSON.stringify({
  source_bytes: source.length,
  wrapped_bytes: wrapped.length,
  compiled_bytes: out.length,
  compile_ms: ms,
  first_120_chars: out.slice(0, 120),
}, null, 2));
