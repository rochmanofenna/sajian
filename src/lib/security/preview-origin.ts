// Helpers for the preview iframe origin split. Returns the origin the
// /setup page should point the iframe at, and the expected origin string
// the parent should pin postMessage to. Same file is used by the preview
// client so both ends stay in sync.
//
// Configuration:
//   NEXT_PUBLIC_PREVIEW_ORIGIN=https://preview.sajian.app   (prod)
//   NEXT_PUBLIC_PREVIEW_ORIGIN= (unset)                     (localhost)
//
// Fallback behavior for dev keeps the current same-origin flow so nobody
// has to provision a second hostname locally to iterate.

export interface PreviewOriginInfo {
  // Absolute origin (protocol + host[+port]) to use for the iframe src.
  origin: string;
  // Whether the origin differs from the parent's window.location.origin.
  // When true we've achieved the full sandbox; when false we're still on
  // same-origin (dev mode) and must not apply `sandbox=allow-scripts`
  // without `allow-same-origin` or the iframe can't reach our own APIs.
  isCrossOrigin: boolean;
}

function normalizeOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, '');
  }
}

export function configuredPreviewOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_PREVIEW_ORIGIN;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizeOrigin(trimmed);
}

export function resolvePreviewOrigin(
  currentOrigin: string,
): PreviewOriginInfo {
  const configured = configuredPreviewOrigin();
  if (!configured) {
    return { origin: currentOrigin, isCrossOrigin: false };
  }
  return { origin: configured, isCrossOrigin: configured !== currentOrigin };
}

// Expected parent origin from the preview's POV. In prod this is the
// app origin (sajian.app). In dev we trust window.location.origin
// because both sides run on localhost.
//
// `NEXT_PUBLIC_APP_ORIGIN` wins if set. Otherwise we infer from the
// current window: when we're actually on preview.sajian.app (or any
// sajian.app subdomain serving the preview route) we default the
// parent to https://sajian.app so the postMessage filter accepts the
// real parent even when the env var was forgotten. Without this
// default, an unset env makes the preview silently discard every
// draft update and render blank.
export function configuredAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (raw) {
    const trimmed = raw.trim();
    if (trimmed) return normalizeOrigin(trimmed);
  }
  if (typeof window !== 'undefined') {
    try {
      const here = new URL(window.location.origin);
      if (here.hostname === 'preview.sajian.app') return 'https://sajian.app';
    } catch {
      // fallthrough
    }
  }
  return null;
}
