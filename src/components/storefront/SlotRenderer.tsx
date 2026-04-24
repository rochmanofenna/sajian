// SlotRenderer — walks a SlotNode tree and dispatches each node to its
// registered primitive. Every subtree is sanitized before it reaches
// this component, so we trust `kind` to be a known primitive and props
// to be shape-valid.
//
// This is the dogfood surface for Phase 1 (manually-built trees stashed
// in section props) and the codegen target for Phase 2 (AI emits
// structured JSON that maps 1:1 to SlotNode).

import { lazy, Suspense, type ReactNode } from 'react';
import { Box, type BoxProps } from './primitives/Box';
import { Button, type ButtonProps } from './primitives/Button';
import { Icon, type IconProps } from './primitives/Icon';
import { Image, type ImageProps } from './primitives/Image';
import { Overlay, type OverlayProps } from './primitives/Overlay';
import { Stack, type StackProps } from './primitives/Stack';
import { Text, type TextProps } from './primitives/Text';
import { sanitizeSlotTreeLenient, type SlotNode } from '@/lib/storefront/sanitizer';
import type { MotionProps } from './primitives/Motion';
import type { CountdownProps } from './primitives/Countdown';
import type { ScheduledProps } from './primitives/Scheduled';
import type { TimeOfDayProps } from './primitives/TimeOfDay';

// framer-motion (~60 KB gz) would land in the customer cold path if we
// imported Motion directly, but most tenants' first render has no
// motion nodes. Lazy-import so the chunk is fetched only when a tree
// actually contains one. Same for the time-based primitives — they all
// boot a setInterval client-side and rarely appear on cold visits.
const Motion = lazy(() => import('./primitives/Motion').then((m) => ({ default: m.Motion })));
const Countdown = lazy(() => import('./primitives/Countdown').then((m) => ({ default: m.Countdown })));
const Scheduled = lazy(() => import('./primitives/Scheduled').then((m) => ({ default: m.Scheduled })));
const TimeOfDay = lazy(() => import('./primitives/TimeOfDay').then((m) => ({ default: m.TimeOfDay })));

interface Props {
  tree: unknown;
}

// Single entry point callers use. Lenient — a bad tree logs + renders
// nothing instead of crashing the surrounding section.
export function SlotRenderer({ tree }: Props) {
  if (!tree) return null;
  const safe = sanitizeSlotTreeLenient(tree);
  if (!safe) return null;
  return <SlotNodeRenderer node={safe} />;
}

function SlotNodeRenderer({ node }: { node: SlotNode }): ReactNode {
  const children = node.children?.map((child, i) => (
    <SlotNodeRenderer key={i} node={child} />
  ));
  const props = (node.props ?? {}) as Record<string, unknown>;

  // Props have already been shape-validated by the sanitizer, but TS
  // can't see that invariant from here. Cast through `unknown` to tell
  // the compiler we know what we're doing; the runtime trust boundary
  // is sanitizeSlotTree.
  // Props have already been shape-validated by the sanitizer, but TS
  // can't see that invariant from here. Cast through `unknown` to tell
  // the compiler we know what we're doing; the runtime trust boundary
  // is sanitizeSlotTree.
  switch (node.kind) {
    case 'motion':
      return (
        <Suspense fallback={null}>
          <Motion {...(props as unknown as MotionProps)}>{children}</Motion>
        </Suspense>
      );
    case 'overlay':
      return <Overlay {...(props as unknown as OverlayProps)}>{children}</Overlay>;
    case 'stack':
      return <Stack {...(props as unknown as StackProps)}>{children}</Stack>;
    case 'box':
      return <Box {...(props as unknown as BoxProps)}>{children}</Box>;
    case 'text':
      return <Text {...(props as unknown as TextProps)} />;
    case 'image':
      return <Image {...(props as unknown as ImageProps)} />;
    case 'button':
      return <Button {...(props as unknown as ButtonProps)} />;
    case 'icon':
      return <Icon {...(props as unknown as IconProps)} />;
    case 'countdown':
      return (
        <Suspense fallback={null}>
          <Countdown {...(props as unknown as CountdownProps)} />
        </Suspense>
      );
    case 'scheduled':
      return (
        <Suspense fallback={null}>
          <Scheduled {...(props as unknown as Omit<ScheduledProps, 'children'>)}>
            {children}
          </Scheduled>
        </Suspense>
      );
    case 'time-of-day':
      return (
        <Suspense fallback={null}>
          <TimeOfDay {...(props as unknown as Omit<TimeOfDayProps, 'children'>)}>
            {children}
          </TimeOfDay>
        </Suspense>
      );
    default:
      return null;
  }
}
