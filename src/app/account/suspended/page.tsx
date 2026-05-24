import Link from "next/link";

/**
 * /account/suspended — landing page for users in a suspended org.
 *
 * Pass G Phase 5 minimal viable surface. The dashboard layout
 * auth-context hook (Phase 5 wiring) redirects here if the active
 * church doc has `suspended_at` set.
 *
 * Intentionally simple: no branding polish beyond the warm-editorial
 * palette, no explanation of *why* (the platform admin handles that
 * separately via direct email). Launch-readiness pass can refine.
 */
export default function SuspendedPage() {
  return (
    <div className="min-h-screen bg-vc-bg px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-vc-warning/10">
          <svg
            className="h-8 w-8 text-vc-warning"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="font-display text-3xl text-vc-indigo">
          Organization access paused
        </h1>
        <p className="mt-4 text-base text-vc-text-secondary">
          Your organization&apos;s access to VolunteerCal has been
          temporarily paused. Your data is preserved.
        </p>
        <p className="mt-2 text-sm text-vc-text-muted">
          For information or to request reinstatement, please contact us at{" "}
          <a
            href="mailto:info@volunteercal.com"
            className="font-medium text-vc-coral hover:underline"
          >
            info@volunteercal.com
          </a>
          .
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-vc-border bg-white px-6 text-sm font-semibold text-vc-indigo transition-colors hover:bg-vc-bg-warm"
          >
            Back to VolunteerCal
          </Link>
        </div>
      </div>
    </div>
  );
}
