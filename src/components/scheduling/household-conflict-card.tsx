"use client";

import type { Household } from "@/lib/types";

interface HouseholdViolation {
  household: Household;
  members: string[];
  date: string;
  reason: string;
}

interface HouseholdConflictCardProps {
  violations: HouseholdViolation[];
}

export function HouseholdConflictCard({ violations }: HouseholdConflictCardProps) {
  if (violations.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-5 w-5 text-amber-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <h3 className="text-sm font-semibold text-amber-800">
          Household Conflicts ({violations.length})
        </h3>
      </div>
      <div className="space-y-2">
        {violations.map((v, i) => (
          <div
            key={`${v.household.id}-${v.date}-${i}`}
            className="rounded-lg border border-amber-200/60 bg-white/60 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-900">
                  {v.household.name}
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  {v.members.join(", ")}
                </p>
              </div>
              <span className="shrink-0 text-xs text-amber-600">
                {v.date}
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-700/80">
              {v.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
