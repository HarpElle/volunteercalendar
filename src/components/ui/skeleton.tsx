interface SkeletonProps {
  className?: string;
  /** Width — accepts any Tailwind or CSS value. Defaults to "100%". */
  width?: string;
  /** Height — accepts any Tailwind or CSS value. Defaults to "1rem". */
  height?: string;
}

/**
 * Animated shimmer placeholder for loading states.
 * Uses the warm editorial palette (cream → warm) for the sweep.
 */
function Skeleton({ className = "", width, height }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer rounded-lg bg-gradient-to-r from-vc-bg-cream via-vc-bg-warm to-vc-bg-cream bg-[length:200%_100%] ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Preset: a card-shaped skeleton with header + 3 lines. */
function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-vc-border-light bg-white p-6 ${className}`}>
      <Skeleton className="mb-3 h-5 w-1/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-2 h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/** Preset: a row of stat cards (e.g., for dashboards). */
function SkeletonStats({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${count} ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-vc-border-light bg-white p-5">
          <Skeleton className="mb-2 h-3 w-1/2" />
          <Skeleton className="h-7 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Preset: a vertical list of rows. */
function SkeletonList({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-vc-border-light bg-white p-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonStats, SkeletonList };
