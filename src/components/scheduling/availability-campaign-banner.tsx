"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

interface AvailabilityCampaignBannerProps {
  dueDate: string;
  coveragePeriod: string;
  message?: string | null;
  onSubmitAvailability: () => void;
  onDismiss?: () => void;
}

/**
 * Format a date like "Apr 5, 2026". Parses YYYY-MM-DD strings
 * in local time to avoid timezone offset issues.
 */
function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Parse "YYYY-MM-DD to YYYY-MM-DD" into a readable range.
 * Same year: "Apr 5 - Apr 26, 2026"
 * Different years: "Dec 28, 2025 - Jan 4, 2026"
 */
function formatCoveragePeriod(period: string): string {
  const parts = period.split(" to ");
  if (parts.length !== 2) return period;

  const [startIso, endIso] = parts;
  const [startYear, startMonth, startDay] = startIso.split("-").map(Number);
  const [endYear, endMonth, endDay] = endIso.split("-").map(Number);

  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);

  if (startYear === endYear) {
    const startStr = startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} \u2013 ${endStr}`;
  }

  return `${formatShortDate(startIso)} \u2013 ${formatShortDate(endIso)}`;
}

/**
 * Compute the number of full days remaining until the due date.
 * Returns 0 if the due date is today or in the past.
 */
function daysUntil(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export function AvailabilityCampaignBanner({
  dueDate,
  coveragePeriod,
  message,
  onSubmitAvailability,
  onDismiss,
}: AvailabilityCampaignBannerProps) {
  const remaining = useMemo(() => daysUntil(dueDate), [dueDate]);
  const periodLabel = useMemo(
    () => formatCoveragePeriod(coveragePeriod),
    [coveragePeriod],
  );
  const dueDateLabel = useMemo(() => formatShortDate(dueDate), [dueDate]);

  const urgencyText =
    remaining === 0
      ? "Due today"
      : remaining === 1
        ? "1 day remaining"
        : `${remaining} days remaining`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative mb-6 rounded-xl border-l-4 border-vc-coral bg-vc-bg-warm px-5 py-4 shadow-sm"
      role="status"
      aria-label="Availability request"
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-vc-text-muted transition-colors hover:bg-vc-bg hover:text-vc-indigo"
          aria-label="Dismiss availability banner"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}

      {/* Content */}
      <div className={onDismiss ? "pr-8" : ""}>
        <h3 className="text-base font-semibold text-vc-indigo">
          Your availability is needed
        </h3>

        <p className="mt-1 text-sm text-vc-text-secondary">
          Scheduling period: <span className="font-medium">{periodLabel}</span>
        </p>

        {message && (
          <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm text-vc-text-secondary italic">
            {message}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="primary"
            size="md"
            onClick={onSubmitAvailability}
            className="min-h-[44px] min-w-[44px]"
          >
            Submit Availability
          </Button>

          <p className="text-sm text-vc-text-muted">
            Due {dueDateLabel} &mdash;{" "}
            <span
              className={
                remaining <= 2
                  ? "font-semibold text-vc-coral"
                  : "font-medium text-vc-text-secondary"
              }
            >
              {urgencyText}
            </span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
