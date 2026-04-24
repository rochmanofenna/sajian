// Server-side JSX → module-function-body compiler. Runs MDX v3 to turn
// sanitized source into `compiled_code` that the RSC runtime executes
// via `@mdx-js/mdx`'s run() at render time.
//
// Never import this from a client component — it pulls babel, MDX, and
// remark. Bundle gate in docs/BUNDLE_BASELINE.md confirms it stays
// server-only.
//
// Two paths the caller gets back:
//   { ok: true, path: 'slot_tree', tree } — JSX reduced to a SlotNode;
//     the custom-section renderer uses SlotRenderer directly (cheap).
//   { ok: true, path: 'compiled', compiled_code, code_hash } — the
//     compile pipeline ran successfully.
//   { ok: false, stage, error }                 — sanitizer or compile
//     failure; callers persist compile_status accordingly.

import { createHash } from 'crypto';
import { compile as mdxCompile } from '@mdx-js/mdx';
import { sanitizeJsx, JSX_SANITIZER_VERSION } from './jsx-sanitizer';
import { SanitizerError, type SlotNode } from './sanitizer';
import { cacheGet, cacheSet } from './compile-cache';

export const COMPILE_VERSION = '1';

export interface CompileError {
  stage: 'sanitizer' | 'compile' | 'limit';
  message: string;
  path?: string;
  rule?: string;
  line?: number;
  col?: number;
}

export type CompileResult =
  | { ok: true; path: 'slot_tree'; tree: SlotNode }
  | { ok: true; path: 'compiled'; compiled_code: string; code_hash: string; ms: number }
  | { ok: false; stage: CompileError['stage']; error: CompileError };

const MAX_COMPILED_BYTES = 50 * 1024;
const MAX_COMPILE_MS = 10_000;

export function hashSource(source: string): string {
  return createHash('sha256')
    .update(`${JSX_SANITIZER_VERSION}|${COMPILE_VERSION}|${source}`)
    .digest('hex');
}

// Wrap the raw JSX in an MDX default-export so the compiler has a stable
// entrypoint to produce. Props + primitives are injected via scope at
// run time by the renderer (see CustomSection.tsx).
function buildMdxSource(cleanedSource: string): string {
  return `
export default function CustomSection(props) {
  return (
${cleanedSource}
  )
}
`;
}

export async function compileSection(
  rawSource: string,
): Promise<CompileResult> {
  // 1. Sanitize — this is the trust boundary. If it throws, we write
  //    compile_status='sanitizer_failed' upstream.
  let sanitized: ReturnType<typeof sanitizeJsx>;
  try {
    sanitized = sanitizeJsx(rawSource);
  } catch (err) {
    if (err instanceof SanitizerError) {
      return {
        ok: false,
        stage: 'sanitizer',
        error: {
          stage: 'sanitizer',
          message: err.message,
          path: err.path,
          rule: err.rule,
        },
      };
    }
    throw err;
  }

  if (sanitized.kind === 'slot_tree') {
    return { ok: true, path: 'slot_tree', tree: sanitized.tree };
  }

  // 2. Compile path — hash first, consult L1/L2 cache before firing MDX.
  const source = sanitized.cleaned_source;
  const code_hash = hashSource(source);
  const cached = await cacheGet(code_hash);
  if (cached) {
    return { ok: true, path: 'compiled', compiled_code: cached, code_hash, ms: 0 };
  }

  const mdxSource = buildMdxSource(source);
  const start = Date.now();
  try {
    // AbortController on mdxCompile would be ideal, but the library
    // doesn't wire one. We cap via a Promise race as defense.
    const compiled = await Promise.race([
      mdxCompile(mdxSource, {
        outputFormat: 'function-body',
        development: false,
        providerImportSource: undefined,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('compile timeout')), MAX_COMPILE_MS),
      ),
    ]);

    const ms = Date.now() - start;
    const compiled_code = String(compiled);
    if (compiled_code.length > MAX_COMPILED_BYTES) {
      return {
        ok: false,
        stage: 'limit',
        error: {
          stage: 'limit',
          message: `compiled output ${compiled_code.length} bytes exceeds ${MAX_COMPILED_BYTES}`,
        },
      };
    }
    await cacheSet(code_hash, compiled_code);
    return { ok: true, path: 'compiled', compiled_code, code_hash, ms };
  } catch (err) {
    const message = (err as Error).message ?? 'compile failed';
    return {
      ok: false,
      stage: message === 'compile timeout' ? 'limit' : 'compile',
      error: { stage: 'compile', message },
    };
  }
}
