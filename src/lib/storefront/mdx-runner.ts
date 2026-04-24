import 'server-only';

// Server-only wrapper around @mdx-js/mdx's run() + the React jsx
// runtime. Isolated into its own module so that even indirect import
// graphs from client components (PreviewClient → StorefrontRenderer →
// section-registry → CustomSection → here) trip webpack's `server-only`
// guard at build time instead of silently pulling MDX into a client
// chunk.

import { run } from '@mdx-js/mdx';
import * as jsxRuntime from 'react/jsx-runtime';
import { Fragment, type ComponentType } from 'react';

export type CompiledComponent = ComponentType<Record<string, unknown>>;

export async function runCompiledMdx(code: string): Promise<CompiledComponent | null> {
  try {
    const module = await run(code, { ...jsxRuntime, Fragment });
    const Cmp = (module as { default?: CompiledComponent }).default;
    return typeof Cmp === 'function' ? Cmp : null;
  } catch (err) {
    console.error('[mdx-runner] run() failed', err);
    return null;
  }
}
