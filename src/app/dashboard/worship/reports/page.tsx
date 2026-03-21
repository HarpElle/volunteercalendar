"use client";

export default function WorshipReportsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Song Usage Reports</h1>
        <p className="mt-1 text-vc-text-secondary">
          Track song usage for CCLI compliance and worship planning insights.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
        <p className="text-vc-text-secondary">Reports are available after publishing service plans with songs.</p>
        <p className="mt-1 text-sm text-vc-text-muted">
          Usage data is automatically tracked when service plans are published.
        </p>
      </div>
    </div>
  );
}
