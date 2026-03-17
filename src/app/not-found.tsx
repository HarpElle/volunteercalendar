import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-vc-bg px-6">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-vc-coral">404</p>
        <h1 className="mt-4 font-display text-2xl text-vc-indigo">Page not found</h1>
        <p className="mt-2 text-sm text-vc-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white hover:bg-vc-coral-dark transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-vc-border px-4 py-2 text-sm font-medium text-vc-indigo hover:bg-vc-bg-warm transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
