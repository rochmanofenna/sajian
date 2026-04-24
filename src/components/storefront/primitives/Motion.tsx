'use client';

// Motion — constrained wrapper over framer-motion. Only the preset
// vocabulary below is exposed; callers can never set arbitrary
// transition configs, keyframes, or spring tuning. This keeps the
// primitive safe for AI-generated trees and the API small enough to
// document in a system prompt.
//
// Enter animations run on mount or when the element scrolls into view
// (depending on `enter_trigger`). Hover runs continuously on hover.
// Loop is the continuous-motion preset (float / pulse / slow spin) — at
// most one loop per element.

import { type CSSProperties, type ReactNode } from 'react';
import { motion, type MotionProps as FmMotionProps, type Variants } from 'framer-motion';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export type MotionEnter =
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'scale'
  | 'blur'
  | 'none';

export type MotionHover = 'lift' | 'scale' | 'glow' | 'tilt' | 'none';
export type MotionLoop = 'float' | 'pulse' | 'spin-slow' | 'none';
export type MotionTrigger = 'mount' | 'in-view' | 'in-view-once';

export interface MotionProps {
  as?: 'div' | 'section' | 'span' | 'img';
  children?: ReactNode;
  enter?: MotionEnter;
  enter_delay_ms?: number;
  enter_duration_ms?: number;
  enter_trigger?: MotionTrigger;
  hover?: MotionHover;
  loop?: MotionLoop;
  className?: string;
  style?: Record<string, unknown>;
  // Image-specific passthroughs when `as='img'`.
  src?: string;
  alt?: string;
}

function clamp(n: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function enterVariants(enter: MotionEnter, durationMs: number, delayMs: number): Variants {
  const duration = durationMs / 1000;
  const delay = delayMs / 1000;
  const t = { duration, delay, ease: 'easeOut' as const };
  switch (enter) {
    case 'fade':
      return { hidden: { opacity: 0 }, shown: { opacity: 1, transition: t } };
    case 'slide-up':
      return { hidden: { opacity: 0, y: 24 }, shown: { opacity: 1, y: 0, transition: t } };
    case 'slide-down':
      return { hidden: { opacity: 0, y: -24 }, shown: { opacity: 1, y: 0, transition: t } };
    case 'slide-left':
      return { hidden: { opacity: 0, x: 24 }, shown: { opacity: 1, x: 0, transition: t } };
    case 'slide-right':
      return { hidden: { opacity: 0, x: -24 }, shown: { opacity: 1, x: 0, transition: t } };
    case 'scale':
      return { hidden: { opacity: 0, scale: 0.92 }, shown: { opacity: 1, scale: 1, transition: t } };
    case 'blur':
      return { hidden: { opacity: 0, filter: 'blur(8px)' }, shown: { opacity: 1, filter: 'blur(0px)', transition: t } };
    case 'none':
    default:
      return { hidden: {}, shown: {} };
  }
}

function hoverProps(hover: MotionHover): FmMotionProps['whileHover'] {
  switch (hover) {
    case 'lift':
      return { y: -4, transition: { duration: 0.18 } };
    case 'scale':
      return { scale: 1.04, transition: { duration: 0.18 } };
    case 'glow':
      return { boxShadow: '0 12px 32px -12px rgba(0,0,0,0.25)', transition: { duration: 0.25 } };
    case 'tilt':
      return { rotate: -1.5, scale: 1.01, transition: { duration: 0.22 } };
    case 'none':
    default:
      return undefined;
  }
}

function loopAnimate(loop: MotionLoop): FmMotionProps['animate'] {
  switch (loop) {
    case 'float':
      return { y: [0, -6, 0], transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' } };
    case 'pulse':
      return { scale: [1, 1.03, 1], transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } };
    case 'spin-slow':
      return { rotate: [0, 360], transition: { duration: 12, repeat: Infinity, ease: 'linear' } };
    case 'none':
    default:
      return undefined;
  }
}

export function Motion({
  as = 'div',
  children,
  enter = 'none',
  enter_delay_ms,
  enter_duration_ms,
  enter_trigger = 'in-view-once',
  hover = 'none',
  loop = 'none',
  className,
  style,
  src,
  alt,
}: MotionProps) {
  const delay = clamp(enter_delay_ms, 0, 2000, 0);
  const duration = clamp(enter_duration_ms, 100, 2000, 500);
  const variants = enterVariants(enter, duration, delay);
  const hoverAnim = hoverProps(hover);
  const loopAnim = loopAnimate(loop);

  // Enter props:
  //   mount         → initial=hidden, animate=shown
  //   in-view       → initial=hidden, whileInView=shown, viewport once=false
  //   in-view-once  → same with once=true (default)
  const enterProps: FmMotionProps = {};
  if (enter !== 'none') {
    enterProps.initial = 'hidden';
    if (enter_trigger === 'mount') {
      enterProps.animate = 'shown';
    } else {
      enterProps.whileInView = 'shown';
      enterProps.viewport = {
        once: enter_trigger !== 'in-view',
        margin: '-10% 0px',
      };
    }
  }

  const mergedStyle: CSSProperties = style ? sanitizeStyle(style) : {};

  // When both enter-animation and loop are requested, animate= is owned
  // by the loop to keep continuous motion after the enter settles; the
  // enter runs via initial + a once-shot shown variant only on mount.
  if (loopAnim) enterProps.animate = loopAnim;

  const common = {
    ...enterProps,
    whileHover: hoverAnim,
    variants,
    className,
    style: mergedStyle,
  };

  if (as === 'img') {
    return <motion.img {...common} src={src} alt={alt ?? ''} />;
  }
  if (as === 'section') {
    return <motion.section {...common}>{children}</motion.section>;
  }
  if (as === 'span') {
    return <motion.span {...common}>{children}</motion.span>;
  }
  return <motion.div {...common}>{children}</motion.div>;
}
