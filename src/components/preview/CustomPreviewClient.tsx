'use client';

// Preview-side custom section renderer. The owner-facing iframe runs
// on preview.sajian.app whose CSP permits 'unsafe-eval', so we can
// turn server-compiled MDX function-body output into a live React
// component via new Function(). Never ship this code path to the
// customer storefront — it stays behind the preview origin guard.
//
// Source of truth is still the server. The iframe receives
// compiled_code + code_hash from the parent via postMessage (Phase 3
// Track 3 contract) and renders it here. When server-side compile
// updates the row, the parent re-posts the fresh compiled_code and
// this component re-renders with the new hash.

import { Fragment, useEffect, useMemo, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { Motion } from '@/components/storefront/primitives/Motion';
import { Overlay } from '@/components/storefront/primitives/Overlay';
import { Stack } from '@/components/storefront/primitives/Stack';
import { Box } from '@/components/storefront/primitives/Box';
import { Countdown } from '@/components/storefront/primitives/Countdown';
import { Scheduled } from '@/components/storefront/primitives/Scheduled';
import { TimeOfDay } from '@/components/storefront/primitives/TimeOfDay';
import { Text } from '@/components/storefront/primitives/Text';
import { Image } from '@/components/storefront/primitives/Image';
import { Button } from '@/components/storefront/primitives/Button';
import { Icon } from '@/components/storefront/primitives/Icon';
import type { SectionContext } from '@/lib/storefront/section-types';

interface Props {
  compiledCode: string;
  ctx: SectionContext;
}

const SCOPE = {
  Motion,
  Overlay,
  Stack,
  Box,
  Countdown,
  Scheduled,
  TimeOfDay,
  Text,
  Image,
  Button,
  Icon,
} as const;

// The MDX `outputFormat: 'function-body'` produces code that reads its
// React jsx runtime from the FIRST argument when invoked via
// `new Function()`. Shape matches @mdx-js/mdx's `run()` helper.
function evaluateFunctionBody(code: string, args: Record<string, unknown>) {
  const fn = new Function(code) as (args: Record<string, unknown>) => unknown;
  return fn(args);
}

export function CustomPreviewClient({ compiledCode, ctx }: Props) {
  const Component = useMemo(() => {
    try {
      const mod = evaluateFunctionBody(compiledCode, { ...jsxRuntime, Fragment }) as {
        default?: React.ComponentType<Record<string, unknown>>;
      };
      return mod.default ?? null;
    } catch (err) {
      console.error('[preview-custom] eval failed', err);
      return null;
    }
  }, [compiledCode]);

  const [hasError, setHasError] = useState(false);
  useEffect(() => setHasError(false), [compiledCode]);

  if (!Component || hasError) {
    return (
      <section
        className="px-6 py-10"
        style={{ background: ctx.colors.background, color: ctx.colors.dark }}
      >
        <div className="max-w-xl mx-auto text-sm opacity-60">
          Preview bagian kustom tidak tersedia (akan muncul setelah kompilasi server selesai).
        </div>
      </section>
    );
  }

  try {
    return (
      <section style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
        <Component {...SCOPE} tenant={{ name: ctx.name, tagline: ctx.tagline, colors: ctx.colors }} />
      </section>
    );
  } catch (err) {
    console.error('[preview-custom] render failed', err);
    return null;
  }
}
