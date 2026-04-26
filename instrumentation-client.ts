/**
 * Sentry browser-side initialization.
 *
 * Loaded automatically by Next.js on the client. No-ops cleanly when
 * NEXT_PUBLIC_SENTRY_DSN is unset, so dev / preview environments without
 * a Sentry project configured won't error.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    // Conservative sample rate to keep quota usage low until we know our
    // baseline traffic. Errors are always captured (sampled by errorSampleRate).
    tracesSampleRate: 0.1,
    // Replays are off by default; flip on selectively when debugging.
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    // Filter out noisy browser-extension errors and known benign warnings.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
    // Send identifying user info only when authenticated (auth-context attaches
    // it via Sentry.setUser elsewhere if/when desired).
    sendDefaultPii: false,
  });
}

// Required by Next.js 15+ to wire up navigation transactions on the client.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
