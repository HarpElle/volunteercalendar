import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Content Security Policy.
 *
 * Shipped in Report-Only mode while we observe what real traffic actually
 * triggers. Violations are sent to Sentry via the Reporting API (see
 * `sentryCspReportUrl()` below + the `Reporting-Endpoints` header). Wave
 * 1.2b flips this to enforcing mode once we've reviewed a week of reports
 * and confirmed no legitimate paths are blocked.
 *
 * Three pieces are wired together for cross-browser coverage:
 *   1. `report-uri` directive — older Chromium/Safari/Firefox fallback
 *   2. `report-to` directive  — modern Reporting API (Chromium 96+)
 *   3. `Reporting-Endpoints` header — defines the endpoint name referenced
 *      by `report-to`. Replaces the deprecated `Report-To` JSON header
 *      that earlier specs used. Chromium accepts either; we ship the new
 *      shape only since that's what supported browsers honor.
 *
 * Endpoint URL is derived from NEXT_PUBLIC_SENTRY_DSN at build time. If
 * the DSN isn't set (local dev without Sentry), the report directives are
 * omitted entirely — better than shipping a dead endpoint.
 */

/**
 * Parse the Sentry DSN at build time and construct the CSP security report URL.
 * DSN format: `https://<public_key>@<host>/<project_id>` → returns
 *   `https://<host>/api/<project_id>/security/?sentry_key=<public_key>`
 * Returns null if DSN is missing or malformed so the caller can no-op.
 */
function sentryCspReportUrl(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const host = url.host;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !host || !projectId) return null;
    return `https://${host}/api/${projectId}/security/?sentry_key=${publicKey}`;
  } catch {
    return null;
  }
}

const CSP_REPORT_URL = sentryCspReportUrl();
const CSP_REPORT_ENDPOINT_NAME = "csp-endpoint";
const cspDirectives: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'", // Next.js inlines small bootstrap scripts; nonce-based hardening is a follow-up
    "'unsafe-eval'", // required by some Firebase SDK paths
    "https://js.stripe.com",
    "https://va.vercel-scripts.com", // Vercel Analytics
    "https://vitals.vercel-insights.com", // Speed Insights
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://www.googletagmanager.com",
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'", // Tailwind injected styles + dynamic inline styles
    "https://fonts.googleapis.com",
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://*.googleusercontent.com",
    "https://lh3.googleusercontent.com",
    "https://firebasestorage.googleapis.com",
    "https://*.gstatic.com",
    "https://*.stripe.com",
  ],
  "font-src": [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
  ],
  "connect-src": [
    "'self'",
    // Firebase
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://firebaseinstallations.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://firestore.googleapis.com",
    "https://firebasestorage.googleapis.com",
    "wss://*.firebaseio.com",
    // Stripe
    "https://api.stripe.com",
    "https://errors.stripe.com",
    // Vercel
    "https://vitals.vercel-insights.com",
    "https://*.vercel-insights.com",
    // Sentry — through the /monitoring tunnel route so ad-blockers don't break us
    "https://*.ingest.sentry.io",
    "https://*.sentry.io",
    // Resend tracking pixels (received emails ping back)
    "https://*.resend.com",
  ],
  "frame-src": [
    "'self'",
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    "https://*.firebaseapp.com", // Firebase Auth iframes
  ],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'", "https://checkout.stripe.com"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "upgrade-insecure-requests": [],
};

// Add reporting directives only if we have a working report endpoint.
if (CSP_REPORT_URL) {
  cspDirectives["report-uri"] = [CSP_REPORT_URL];
  cspDirectives["report-to"] = [CSP_REPORT_ENDPOINT_NAME];
}

const cspString = Object.entries(cspDirectives)
  .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
  .join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Allow camera (QR scanning on kiosks), geolocation (proximity check-in
            // if enabled). Disallow everything else by default.
            value:
              "camera=(self), geolocation=(self), microphone=(), payment=(self), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
          },
          { key: "X-Frame-Options", value: "DENY" }, // belt-and-suspenders w/ frame-ancestors
          // Reporting API endpoint definition — referenced by the `report-to`
          // CSP directive. Only emitted when we actually have a Sentry DSN to
          // forward reports to (omit in DSN-less dev/preview).
          ...(CSP_REPORT_URL
            ? [
                {
                  key: "Reporting-Endpoints",
                  value: `${CSP_REPORT_ENDPOINT_NAME}="${CSP_REPORT_URL}"`,
                },
              ]
            : []),
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspString,
          },
        ],
      },
    ];
  },
};

// Sentry build-time integration. Runtime no-ops cleanly when DSN env vars
// are unset, so this is safe even before a Sentry project is provisioned.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  telemetry: false,
});
