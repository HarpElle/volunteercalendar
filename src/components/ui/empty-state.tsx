import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// EmptyState — Standardized empty/zero-data display
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  /** Icon element (typically an SVG, rendered at 48px) */
  icon?: ReactNode;
  /** Heading text */
  title: string;
  /** Supporting description */
  description?: string;
  /** Optional action button or link */
  action?: ReactNode;
  /** Additional class names */
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`rounded-xl border border-dashed border-vc-border bg-white px-6 py-12 text-center sm:px-12 ${className}`}>
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-vc-text-muted">
          {icon}
        </div>
      )}
      <h3 className="font-semibold text-vc-text-secondary">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-vc-text-muted">{description}</p>
      )}
      {action && (
        <div className="mt-5">{action}</div>
      )}
    </div>
  );
}
