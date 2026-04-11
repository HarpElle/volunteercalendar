import Link from "next/link";

interface AccessDeniedProps {
  /** What the user needs to access this page (e.g., "Admin or owner") */
  requiredRole?: string;
}

export function AccessDenied({ requiredRole = "Admin" }: AccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm rounded-xl border border-vc-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-vc-bg-warm">
          <svg className="h-6 w-6 text-vc-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <h2 className="font-display text-lg font-semibold text-vc-indigo">Access Restricted</h2>
        <p className="mt-2 text-sm text-vc-text-muted">
          {requiredRole} access is required to view this page. Contact your organization administrator if you need access.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white transition hover:bg-vc-coral/90"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
