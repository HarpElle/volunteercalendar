"use client";

import type { AttendanceStatus } from "@/lib/types";

interface AttendanceToggleProps {
  value: AttendanceStatus;
  onClick: () => void;
}

export function AttendanceToggle({ value, onClick }: AttendanceToggleProps) {
  if (value === "present") {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-vc-sage/15 px-2.5 py-1 text-xs font-medium text-vc-sage transition-colors hover:bg-vc-sage/25"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Present
      </button>
    );
  }
  if (value === "no_show") {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-vc-danger/5 px-2.5 py-1 text-xs font-medium text-vc-danger transition-colors hover:bg-vc-danger/10"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        No-show
      </button>
    );
  }
  if (value === "excused") {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-vc-sand/20 px-2.5 py-1 text-xs font-medium text-vc-sand transition-colors hover:bg-vc-sand/30"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 4.5v5a2 2 0 002 2h1l1.5 1.5 1.5-1.5h1a2 2 0 002-2v-5a2 2 0 00-2-2h-5a2 2 0 00-2 2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="5.5" cy="7" r="0.5" fill="currentColor" />
          <circle cx="7" cy="7" r="0.5" fill="currentColor" />
          <circle cx="8.5" cy="7" r="0.5" fill="currentColor" />
        </svg>
        Excused
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-vc-bg-cream px-2.5 py-1 text-xs font-medium text-vc-text-muted transition-colors hover:bg-vc-bg-warm"
    >
      Not marked
    </button>
  );
}
