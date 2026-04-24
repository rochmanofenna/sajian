// Icon — thin wrapper around the subset of lucide-react icons we want
// available to the AI. Keeps the catalog small (and the bundle clean —
// lucide tree-shakes per import) and blocks the AI from referring to
// unknown icon names.

import {
  Sparkles,
  Heart,
  Star,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  Clock,
  ShoppingBag,
  Utensils,
  Coffee,
  Flame,
  CheckCircle,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { type CSSProperties } from 'react';
import { sanitizeStyle } from '@/lib/storefront/safe-style';

export const ICON_CATALOG = {
  sparkles: Sparkles,
  heart: Heart,
  star: Star,
  'arrow-right': ArrowRight,
  phone: Phone,
  mail: Mail,
  'map-pin': MapPin,
  clock: Clock,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  coffee: Coffee,
  flame: Flame,
  'check-circle': CheckCircle,
  'alert-circle': AlertCircle,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICON_CATALOG;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: Record<string, unknown>;
}

export function Icon({ name, size = 20, className, style }: IconProps) {
  const Cmp = ICON_CATALOG[name];
  if (!Cmp) return null;
  const css: CSSProperties = style ? sanitizeStyle(style) : {};
  const clamped = Math.min(Math.max(size, 8), 128);
  return <Cmp size={clamped} className={className} style={css} aria-hidden="true" />;
}
