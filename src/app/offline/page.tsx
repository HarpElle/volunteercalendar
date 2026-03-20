import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vc-bg px-4">
      <div className="text-center max-w-md">
        {/* Logo */}
        <div className="mx-auto mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-vc-indigo">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="8" cy="15" r="1" fill="currentColor" />
              <circle cx="12" cy="15" r="1" fill="currentColor" />
              <circle cx="16" cy="15" r="1" fill="currentColor" />
            </svg>
          </div>
          <span className="font-display text-xl text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </div>

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-vc-sand/20">
          <svg className="h-8 w-8 text-vc-sand" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </div>
        <h1 className="font-display text-2xl text-vc-indigo mb-2">You&apos;re offline right now</h1>
        <p className="text-vc-text-secondary mb-2">
          Don&apos;t worry — your schedule will be here when you reconnect.
        </p>
        <p className="text-sm text-vc-text-muted mb-6">
          You can still view your most recently loaded schedule.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-vc-coral px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-vc-coral-dark"
        >
          Check Connection
        </Link>
      </div>
    </div>
  );
}
