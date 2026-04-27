import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Content Security Policy.
 *
 * Shipped in Report-Only mode for the first ~7 days so violations are
 * collected via Sentry/Vercel without breaking real users. After observing
 * reports we flip to enforcing mode by changing the header name from
 * `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.
 */
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
