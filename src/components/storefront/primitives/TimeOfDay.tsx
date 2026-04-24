'use client';

// TimeOfDay — renders children only inside the configured local-hours
// window [from_hour, to_hour). If from > to, the window wraps midnight
// (e.g. from=22, to=2 means 22:00–01:59 local). Re-checks every minute
// so a customer keeping the tab open at closing time sees the correct
// content without a reload.

import { useEffect, useState, type ReactNode } from 'react';

export interface TimeOfDayProps {
  from_hour: number;
  to_hour: number;
  children: ReactNode;
  fallback?: ReactNode;
}

function isInWindow(fromHour: number, toHour: number, hour: number): boolean {
  if (fromHour === toHour) return true;
  if (fromHour < toHour) return hour >= fromHour && hour < toHour;
  return hour >= fromHour || hour < toHour;
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const n = Math.floor(h);
  if (n < 0) return 0;
  if (n > 23) return 23;
  return n;
}

export function TimeOfDay({ from_hour, to_hour, children, fallback = null }: TimeOfDayProps) {
  const from = clampHour(from_hour);
  const to = clampHour(to_hour);

  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  return isInWindow(from, to, hour) ? <>{children}</> : <>{fallback}</>;
}
