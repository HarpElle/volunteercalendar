"use client";

import { useState, useRef, useEffect } from "react";
import { useActiveCampus } from "@/lib/context/campus-context";
import { useAuth } from "@/lib/context/auth-context";
import { isScheduler } from "@/lib/utils/permissions";

/**
 * Pass H Phase 1: campus selector for the sidebar header.
 *
 * Renders ONLY when the active org has 2+ campuses. Single-campus orgs
 * see nothing (selector hides itself). The selection is persisted to
 * both localStorage and the user's membership doc via CampusProvider.
 *
 * UX matches the multi-org switcher pattern: small chip below the brand
 * mark, click to open a popover with all campuses + "All campuses"
 * sentinel at the top.
 */
export function CampusSelector() {
  const { campuses, isMultiCampus, activeCampusId, setActiveCampusId } =
    useActiveCampus();
  const { activeMembership } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Codex Phase 1 retest Sev 3: hide for volunteer-only users. The
  // selector controls a filter that only affects admin/scheduler views
  // (Schedules, Service Day, People, reports). Volunteers' personal
  // views always show their own assignments across all their campuses;
  // a campus filter would be meaningless and confusing. Role gate
  // lives inside the component so all callers inherit it (defense in
  // depth — future Mobile More menu placement, etc.).
  if (!isScheduler(activeMembership)) return null;

  if (!isMultiCampus) return null;

  const activeName = activeCampusId
    ? campuses.find((c) => c.id === activeCampusId)?.name ?? "All campuses"
    : "All campuses";

  return (
    <div ref={ref} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 truncate text-left text-xs text-vc-text-muted hover:text-vc-indigo transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch campus"
      >
        <span className="truncate">📍 {activeName}</span>
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-vc-border-light bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setActiveCampusId(null);
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
              activeCampusId === null
                ? "font-medium text-vc-coral"
                : "text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo"
            }`}
          >
            <span>All campuses</span>
            {activeCampusId === null && (
              <svg className="h-3.5 w-3.5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </button>
          <div className="border-t border-vc-border-light" />
          {campuses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveCampusId(c.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                activeCampusId === c.id
                  ? "font-medium text-vc-coral"
                  : "text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo"
              }`}
            >
              <span className="truncate">
                {c.name}
                {c.is_primary && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-vc-text-muted">
                    Primary
                  </span>
                )}
              </span>
              {activeCampusId === c.id && (
                <svg className="h-3.5 w-3.5 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
