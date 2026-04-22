// Small helpers used across storefront + dashboard.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, symbol = 'Rp ', locale = 'id-ID'): string {
  const formatted = new Intl.NumberFormat(locale).format(amount);
  return `${symbol}${formatted}`;
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const delta = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (delta < 60) return 'baru saja';
  if (delta < 3600) return `${Math.floor(delta / 60)}m lalu`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}j lalu`;
  return `${Math.floor(delta / 86400)}h lalu`;
}
