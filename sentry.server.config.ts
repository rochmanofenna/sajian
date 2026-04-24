// Sentry — server runtime init. Phase 4 introduces codegen-specific
// telemetry; this file only initializes Sentry when SENTRY_DSN is
// actually set, so dev + preview builds without the env stay no-op.
//
// Sample rate is modest (10%) for traces + 0 replays (PII-heavy UI).
// Every scope is tagged with tenant_id + section_id at the call site
// via withScope in src/lib/storefront/observability.ts.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}
