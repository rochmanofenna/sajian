// Content-Security-Policy builder. Composes the directive string per
// request so the nonce can be per-request and routes can differ (tenant
// storefronts block framing, the onboarding origin needs to host the
// preview iframe).
//
// Ship strategy:
//   • `Content-Security-Policy-Report-Only` for a burn-in period so we
//     can catch violations without breaking customers. Flip the env var
//     `CSP_ENFORCE=1` to switch to the enforcing header once reports are
//     clean.
//   • Violations land at POST /api/csp-report where they're logged.

export type CspContext = 'storefront' | 'app' | 'preview';

interface BuildOptions {
  context: CspContext;
  nonce: string;
  // Origin of the preview iframe — the document the parent embeds.
  // Used on the 'app' context to extend frame-src so /setup can load
  // https://preview.sajian.app/preview/... without a CSP block.
  previewFrameOrigin?: string;
  // Origin of the app (sajian.app / localhost) — the document that
  // embeds the preview. Used on the 'preview' context to extend
  // frame-ancestors so preview.sajian.app agrees to be embedded by it.
  appFrameOrigin?: string;
}

// Any supabase project we might talk to — connect-src for realtime,
// img-src + media-src for asset bucket URLs.
function supabaseOrigins(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return ['https://*.supabase.co', 'wss://*.supabase.co'];
  try {
    const { hostname } = new URL(url);
    return [`https://${hostname}`, `wss://${hostname}`];
  } catch {
    return ['https://*.supabase.co', 'wss://*.supabase.co'];
  }
}

export function buildCsp({
  context,
  nonce,
  previewFrameOrigin,
  appFrameOrigin,
}: BuildOptions): string {
  const supabase = supabaseOrigins();
  const connect = [
    "'self'",
    ...supabase,
    // Xendit redirect flow + webhook origins — keeps the checkout page
    // working when the owner lights up digital payments.
    'https://api.xendit.co',
  ];

  const img = [
    "'self'",
    'data:',
    'blob:',
    ...supabase,
    // AI-generated images from OpenAI (short-lived URLs) — we persist to
    // Supabase so this is mainly the logo generation preview.
    'https://oaidalleapiprodscus.blob.core.windows.net',
    'https://*.googleusercontent.com',
  ];

  // Google Maps embed for the location / contact with_map variants.
  // On the app context, also allow framing the preview origin so the
  // /setup iframe isn't blocked. Preview itself has no business
  // embedding anything, but 'self' covers any same-origin asset.
  const frameSrc = [
    "'self'",
    'https://www.google.com',
    'https://maps.google.com',
    ...(context === 'app' && previewFrameOrigin ? [previewFrameOrigin] : []),
    ...(context === 'app' ? ['https://preview.sajian.app'] : []),
  ];

  // frame-ancestors = "who can put ME in an iframe". Semantics per context:
  //   • storefront  → 'none': never frame a customer's store.
  //   • preview     → app origin: the /setup page embeds us. The preview
  //                   origin is NOT a valid ancestor of itself.
  //   • app         → 'self': nothing else embeds the app.
  const frameAncestors =
    context === 'storefront'
      ? ["'none'"]
      : context === 'preview'
        ? ["'self'", appFrameOrigin, 'https://sajian.app', 'https://www.sajian.app']
            .filter(Boolean)
            .map(String)
        : ["'self'"];

  // `'strict-dynamic'` lets scripts loaded by our nonced bootstrap pull
  // in their own chunks without every chunk needing its own nonce or
  // hash. Incompatible with explicit host allowlists (they become no-ops
  // when strict-dynamic is set) — that's a feature, it blocks any script
  // host we didn't nonce ourselves.
  // Preview origin (preview.sajian.app) ships 'wasm-unsafe-eval' +
  // 'unsafe-eval' so the owner-side custom-section renderer can compile
  // JSX instantly via new Function(). This relaxation applies ONLY
  // to preview — tenant storefronts and the onboarding app stay strict.
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(context === 'preview' ? ["'wasm-unsafe-eval'", "'unsafe-eval'"] : []),
  ];

  // Style: Next's font loader + Tailwind runtime need inline styles for
  // CSS variables. We can't adopt nonces on inline style because React
  // emits many of them; keep 'unsafe-inline' here (styles can't execute
  // JS so the risk is minor) and plan to migrate to hashes later.
  const style = ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'];
  const font = ["'self'", 'data:', 'https://fonts.gstatic.com'];

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', script],
    ['style-src', style],
    ['font-src', font],
    ['img-src', img],
    ['media-src', ["'self'", 'blob:', ...supabase]],
    ['connect-src', connect],
    ['frame-src', frameSrc],
    ['frame-ancestors', frameAncestors],
    ['form-action', ["'self'"]],
    ['base-uri', ["'none'"]],
    ['object-src', ["'none'"]],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'", 'blob:']],
    // Browsers auto-upgrade http subresources to https so mixed content
    // never leaks.
    ['upgrade-insecure-requests', []],
    // Report destination is an internal route; keep the path cheap so a
    // violation burst doesn't pile up function invocations.
    ['report-uri', ['/api/csp-report']],
  ];

  return directives
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

export function isCspEnforcing(): boolean {
  return process.env.CSP_ENFORCE === '1';
}

export function cspHeaderName(): string {
  return isCspEnforcing()
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
}
