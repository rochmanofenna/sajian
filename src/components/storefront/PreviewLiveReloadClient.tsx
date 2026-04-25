'use client';

// Listens for `sajian:reload` postMessage from the parent app origin
// (the /setup page) and reloads the iframe so the next render reads
// the freshly autosaved draft. Only mounted under PreviewModeBanner
// so it never runs for live customers.

import { useEffect } from 'react';

const ALLOWED_PARENT_HOSTNAMES = new Set([
  'sajian.app',
  'www.sajian.app',
  'app.sajian.app',
  'localhost',
  '127.0.0.1',
]);

function isAllowedParentOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (ALLOWED_PARENT_HOSTNAMES.has(u.hostname)) return true;
    if (u.hostname.endsWith('.localhost')) return true;
    if (u.hostname.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

export function PreviewLiveReloadClient() {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isAllowedParentOrigin(e.origin)) return;
      const data = e.data as { type?: string } | null;
      if (data?.type === 'sajian:reload') {
        // Avoid runaway loops: only reload once per 800ms even if the
        // parent fat-fingers the broadcast.
        const now = Date.now();
        const last = Number(window.sessionStorage.getItem('sajian:last-reload') ?? 0);
        if (now - last < 800) return;
        window.sessionStorage.setItem('sajian:last-reload', String(now));
        window.location.reload();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return null;
}
