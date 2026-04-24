'use client';

// Scheduled — renders children only when `now` falls inside the
// start/end window. Either bound may be omitted to make the window
// half-open. Uses the client clock so a stale static render doesn't
// leak pre-/post-window content.

import { useEffect, useState, type ReactNode } from 'react';

export interface ScheduledProps {
  start_iso?: string;
  end_iso?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function Scheduled({ start_iso, end_iso, children, fallback = null }: ScheduledProps) {
  const start = parseIso(start_iso);
  const end = parseIso(end_iso);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (start !== null && now < start) return <>{fallback}</>;
  if (end !== null && now >= end) return <>{fallback}</>;
  return <>{children}</>;
}
