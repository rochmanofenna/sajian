// Custom section renderer. Prefers compiled MDX output when available,
// falls back to a sanitized slot tree, and finally shows a neutral
// "sedang disiapkan" card so the page never blanks.
//
// Server component — the MDX runner is its own `server-only` module so
// webpack errors loudly if anything in the client graph ever tries to
// reach it. The `await import(...)` below keeps MDX off the static
// import graph from this file as well.

import type { SectionComponentProps } from '@/lib/storefront/section-types';
import { SlotRenderer } from '@/components/storefront/SlotRenderer';
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

interface CustomProps {
  compiled_code?: string | null;
  code_hash?: string | null;
  compile_status?: string | null;
  compile_error?: Record<string, unknown> | null;
  slot_tree?: unknown;
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

export async function CustomSection({
  section,
  ctx,
  props,
}: SectionComponentProps<CustomProps>) {
  if (props.compile_status === 'ok' && props.compiled_code) {
    const { runCompiledMdx } = await import('@/lib/storefront/mdx-runner');
    const Cmp = await runCompiledMdx(props.compiled_code);
    if (Cmp) {
      return (
        <section style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
          <Cmp {...SCOPE} tenant={{ name: ctx.name, tagline: ctx.tagline, colors: ctx.colors }} />
        </section>
      );
    }
    console.warn('[custom-section] compiled_code present but run failed', {
      section_id: section.id,
      code_hash: props.code_hash,
    });
  }

  if (props.slot_tree) {
    return (
      <section style={{ background: ctx.colors.background, color: ctx.colors.dark }}>
        <SlotRenderer tree={props.slot_tree} />
      </section>
    );
  }

  return (
    <section
      className="px-6 py-10"
      style={{ background: ctx.colors.background, color: ctx.colors.dark }}
    >
      <div
        className="max-w-xl mx-auto rounded-2xl border px-5 py-6 text-center"
        style={{
          borderColor: `${ctx.colors.primary}22`,
          background: `${ctx.colors.primary}08`,
        }}
      >
        <div
          className="text-xs uppercase tracking-[0.18em] opacity-70"
          style={{ color: ctx.colors.primary }}
        >
          Bagian kustom
        </div>
        <div className="mt-2 text-sm font-medium opacity-85">
          Bagian ini sedang disiapkan.
        </div>
      </div>
    </section>
  );
}
