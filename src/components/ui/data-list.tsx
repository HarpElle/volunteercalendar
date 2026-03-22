import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DataList — Clean row-based list with dividers
// ---------------------------------------------------------------------------

interface DataListProps {
  children: ReactNode;
  className?: string;
}

export function DataList({ children, className = "" }: DataListProps) {
  return (
    <div className={`divide-y divide-vc-border-light rounded-xl bg-white ring-1 ring-vc-border-light ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataListRow
// ---------------------------------------------------------------------------

interface DataListRowProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DataListRow({ children, onClick, className = "" }: DataListRowProps) {
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      className={`flex items-center gap-4 px-5 py-4 ${
        interactive
          ? "cursor-pointer transition-colors hover:bg-vc-bg-warm/50 focus-visible:bg-vc-bg-warm/50"
          : ""
      } first:rounded-t-xl last:rounded-b-xl ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataListCell — Flexible cell for row content
// ---------------------------------------------------------------------------

interface DataListCellProps {
  children: ReactNode;
  /** "grow" fills remaining space, "shrink" keeps compact */
  flex?: "grow" | "shrink";
  className?: string;
}

export function DataListCell({ children, flex = "shrink", className = "" }: DataListCellProps) {
  return (
    <div className={`${flex === "grow" ? "min-w-0 flex-1" : "shrink-0"} ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataListAction — Three-dot menu or action area
// ---------------------------------------------------------------------------

interface DataListActionProps {
  children: ReactNode;
  className?: string;
}

export function DataListAction({ children, className = "" }: DataListActionProps) {
  return (
    <div className={`ml-auto shrink-0 ${className}`}>
      {children}
    </div>
  );
}
