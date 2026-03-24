"use client";

interface OverLimitBannerProps {
  resourceLabel: string;
  currentCount: number;
  limit: number;
}

export function OverLimitBanner({
  resourceLabel,
  currentCount,
  limit,
}: OverLimitBannerProps) {
  if (limit === -1 || limit === Infinity || currentCount <= limit) return null;

  return (
    <div className="mb-4 rounded-xl border border-vc-coral/30 bg-vc-coral/5 px-4 py-3">
      <p className="text-sm font-medium text-vc-indigo">
        You have {currentCount} {resourceLabel}, but your current plan allows{" "}
        {limit}.
      </p>
      <p className="mt-1 text-xs text-vc-text-secondary">
        Your existing {resourceLabel} are preserved. To add more, remove some or{" "}
        <a
          href="/dashboard/settings?tab=billing"
          className="font-medium text-vc-coral hover:underline"
        >
          upgrade your plan
        </a>
        .
      </p>
    </div>
  );
}
