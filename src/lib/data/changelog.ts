/**
 * Hand-curated changelog entries.
 *
 * Append new entries to the TOP of the array. Each entry is one shippable
 * unit of work — a Wave / feature / fix — not a per-commit changelog.
 * Aim for plain-language descriptions a church admin can understand
 * without engineering vocabulary.
 *
 * The /changelog page renders this list. To add an entry:
 *   1. Pick a category ("Feature" | "Improvement" | "Fix" | "Infra")
 *   2. Date is the day it went live (the production deploy day), not
 *      the commit day
 *   3. Title is a short noun phrase (5-7 words)
 *   4. Summary is 1-3 sentences, customer-facing
 *   5. (Optional) include `prs` for the linked PR numbers — these surface
 *      as small chips for transparency
 */

export type ChangelogCategory = "Feature" | "Improvement" | "Fix" | "Infra";

export interface ChangelogEntry {
  /** ISO date (YYYY-MM-DD) — the production deploy day, not commit day. */
  date: string;
  category: ChangelogCategory;
  title: string;
  /** 1-3 plain-language sentences. Avoid engineering jargon. */
  summary: string;
  /** Optional PR numbers for transparency. */
  prs?: number[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-05-27",
    category: "Improvement",
    title: "Activity feed now captures every sensitive change",
    summary:
      "The org Activity log (Settings → Activity) now records member invites, role changes, removals, tier changes, kiosk activations, child checkout, and CSV exports. Customer support has a complete record when answering 'who changed Sarah's role last Tuesday?'",
    prs: [110],
  },
  {
    date: "2026-05-27",
    category: "Feature",
    title: "Notify team leads when a schedule is ready for review",
    summary:
      "The Request Approval button on Growth+ schedules now actually sends an email to each ministry lead, asking them to review and approve their team's portion. Falls back gracefully when a team has no lead email set.",
    prs: [111],
  },
  {
    date: "2026-05-26",
    category: "Infra",
    title: "Every API route now uses standardized auth and validation",
    summary:
      "Internal: 19 high-risk API routes migrated to a shared authz library with consistent error messages and Zod-validated request bodies. Tightens the seam where bugs love to hide and surfaces a uniform 401/403/400 vocabulary to clients.",
    prs: [101, 102, 103, 104, 105, 106, 107, 108],
  },
  {
    date: "2026-05-26",
    category: "Improvement",
    title: "Schedule status now denormalized for faster reads",
    summary:
      "Internal: child assignment docs carry their parent schedule's status so volunteer-facing lookups no longer pay a per-read parent-fetch cost. Sets up later strict access rules for draft schedules.",
    prs: [99],
  },
  {
    date: "2026-05-26",
    category: "Improvement",
    title: "Reminder send loop now bullet-proof against duplicates",
    summary:
      "Retried cron sends never re-send the same email or SMS, thanks to per-channel claim flags written inside a Firestore transaction. The legacy array shape is auto-migrated on first run.",
    prs: [95],
  },
  {
    date: "2026-05-26",
    category: "Infra",
    title: "Cron visibility — see when scheduled jobs last ran",
    summary:
      "New Platform Admin → Cron Runs page surfaces the last 7 days of cron starts, completions, durations, and processed counts. Cron failures stop being invisible.",
    prs: [96],
  },
  {
    date: "2026-05-25",
    category: "Infra",
    title: "Structured logging + Content-Security-Policy reporting",
    summary:
      "Internal: a new lib/log wrapper unifies our error pipeline into Sentry with no console-statement leaks. CSP violations now report to Sentry in report-only mode, with enforcement flipping on after ~1 week of telemetry.",
    prs: [92, 93, 94],
  },
  {
    date: "2026-05-25",
    category: "Improvement",
    title: "Admin sign-ins now count for org activity status",
    summary:
      "Previously the org list showed 'dormant' for any church whose owner hadn't signed in even when their admins were in the app daily. Activity status is now the max of every admin-level sign-in date.",
    prs: [87, 88, 89, 90],
  },
  {
    date: "2026-05-24",
    category: "Fix",
    title: "Safari sign-in fixed via Firestore long-polling fallback",
    summary:
      "Safari's tracking protection blocks the WebSocket Firebase needs by default. The client now auto-falls back to long-polling so login works for all volunteers regardless of browser.",
    prs: [86],
  },
];
