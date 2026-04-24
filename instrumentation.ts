// Next.js instrumentation hook — runtime-aware Sentry bootstrap.
// Called once per server worker at boot. The matching sentry.*.config
// files detect the DSN env themselves and no-op when absent so dev +
// preview builds don't need a Sentry project.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
