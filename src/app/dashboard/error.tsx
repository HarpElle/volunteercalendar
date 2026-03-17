"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-coral/10">
        <svg className="h-7 w-7 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 className="font-display text-xl text-vc-indigo">Something went wrong</h2>
      <p className="mt-2 text-sm text-vc-text-secondary">
        This section encountered an error. The rest of the app still works.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-vc-text-muted">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white hover:bg-vc-coral-dark transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
