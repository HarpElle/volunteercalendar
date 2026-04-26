import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
};

// Sentry build-time integration. Runtime no-ops cleanly when DSN env vars
// are unset, so this is safe even before a Sentry project is provisioned.
export default withSentryConfig(nextConfig, {
  // Sentry org + project come from env (SENTRY_ORG, SENTRY_PROJECT).
  // Auth token from SENTRY_AUTH_TOKEN — required only for source-map uploads;
  // safely absent in environments without it.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  // Disable bundle-size warning until we have a baseline to compare against.
  disableLogger: true,
  // Skip telemetry to Sentry's product analytics.
  telemetry: false,
});
