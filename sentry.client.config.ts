// Sentry — browser runtime init. Runs on every storefront + admin
// page; we keep the default integrations but disable Replay entirely
// to avoid capturing customer inputs (emails, phone numbers, OTP
// fields). NEXT_PUBLIC_SENTRY_DSN is required for client bundling —
// the DSN is publishable.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.NODE_ENV ??
      'development',
  });
}
