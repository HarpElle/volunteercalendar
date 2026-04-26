"use client";

/**
 * Root-level error boundary for App Router.
 *
 * This catches errors thrown in the root layout itself (above any per-route
 * error.tsx boundary). Required by Next.js to render its own <html>/<body>
 * because the parent layout may have failed.
 *
 * Reports the error to Sentry so we see uncaught failures from the very top
 * of the tree.
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif",
          background: "#FEFCF9",
          color: "#3D405B",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6b6f8c" }}>
            We&apos;ve been notified and are looking into it. Please refresh the
            page or come back in a few minutes.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#9aa0b8",
                marginTop: "0.5rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "#E07A5F",
              color: "white",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Go to homepage
          </a>
        </div>
      </body>
    </html>
  );
}
