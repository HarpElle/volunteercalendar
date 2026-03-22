import Link from "next/link";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChangeDirection = "up" | "down" | "neutral";

interface StatCardProps {
  /** Small label above the value */
  label: string;
  /** Large display value (number or formatted string) */
  value: string | number;
  /** Tailwind text color class for the value (e.g. "text-vc-sage") */
  valueColor?: string;
  /** Optional smaller text below the value */
  subtext?: string;
  /** Optional icon rendered before the label */
  icon?: ReactNode;
  /** Optional change indicator (e.g. "+12%") */
  change?: {
    value: string;
    direction: ChangeDirection;
  };
  /** Optional sparkline data points (0-1 normalized values) */
  sparkline?: number[];
  /** If provided, the card becomes a link */
  href?: string;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Sparkline (inline SVG)
// ---------------------------------------------------------------------------

function Sparkline({ data, color = "var(--vc-coral)" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 28;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Change Indicator
// ---------------------------------------------------------------------------

const changeColors: Record<ChangeDirection, string> = {
  up: "text-vc-sage",
  down: "text-vc-danger",
  neutral: "text-vc-text-muted",
};

function ChangeIndicator({ value, direction }: { value: string; direction: ChangeDirection }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${changeColors[direction]}`}>
      {direction === "up" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
        </svg>
      )}
      {direction === "down" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
        </svg>
      )}
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  valueColor = "text-vc-indigo",
  subtext,
  icon,
  change,
  sparkline,
  href,
  className = "",
}: StatCardProps) {
  const content = (
    <div
      className={`rounded-xl border border-vc-border-light bg-white p-5 ${
        href ? "transition-all hover:-translate-y-0.5 hover:shadow-md" : ""
      } ${className}`}
    >
      {/* Top row: label + sparkline */}
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-vc-text-muted">
          {icon}
          {label}
        </p>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} />
        )}
      </div>

      {/* Value row */}
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
        {change && (
          <ChangeIndicator value={change.value} direction={change.direction} />
        )}
      </div>

      {/* Subtext */}
      {subtext && (
        <p className="mt-1 text-xs text-vc-text-muted">{subtext}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

// ---------------------------------------------------------------------------
// StatCardGrid (layout helper)
// ---------------------------------------------------------------------------

export function StatCardGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {children}
    </div>
  );
}
