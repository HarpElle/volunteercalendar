/**
 * Hand-curated system status content for the public /status page.
 *
 * For the MVP we don't have external monitoring tied into this — it's a
 * human-edited file. Update `OVERALL_STATUS`, `SUBSYSTEMS`, and
 * `RECENT_INCIDENTS` by editing this file. Vercel auto-deploys on push.
 *
 * Once we wire up Better Uptime / Statuspage / similar, swap the data
 * source out and keep the same shape — the /status page just renders
 * whatever this module exports.
 */

export type SystemHealth = "operational" | "degraded" | "outage" | "maintenance";

export interface Subsystem {
  /** Display name, e.g. "Email delivery" */
  name: string;
  /** Internal id for stable rendering / future stable URLs (#email) */
  id: string;
  health: SystemHealth;
  /** Short plain-language description of what this subsystem does. */
  description: string;
  /** Optional one-liner shown when health !== "operational". */
  note?: string;
}

export interface IncidentEntry {
  /** ISO date the incident started. */
  date: string;
  title: string;
  /** Single resolved or ongoing status. */
  status: "resolved" | "monitoring" | "investigating";
  /** Plain-language summary of what happened, in past tense if resolved. */
  summary: string;
  /** Length in plain English ("23 minutes", "2 hours"). Optional if ongoing. */
  duration?: string;
}

/** Top-of-page health pill. Update this first when you flip incidents. */
export const OVERALL_STATUS: SystemHealth = "operational";

/** Optional message shown alongside the OVERALL_STATUS pill (any state). */
export const OVERALL_MESSAGE: string | null = null;

export const SUBSYSTEMS: Subsystem[] = [
  {
    id: "app",
    name: "Web app",
    health: "operational",
    description: "Dashboard, sign-in, schedule generation, and approvals.",
  },
  {
    id: "database",
    name: "Database",
    health: "operational",
    description: "Volunteer profiles, schedules, and household data.",
  },
  {
    id: "email",
    name: "Email delivery",
    health: "operational",
    description:
      "Reminders, invite emails, and team-lead approval notifications.",
  },
  {
    id: "sms",
    name: "SMS reminders",
    health: "operational",
    description: "Text-message reminders for upcoming serving slots.",
  },
  {
    id: "checkin",
    name: "Children's check-in",
    health: "operational",
    description: "Kiosk check-in/check-out flows and security-code printing.",
  },
  {
    id: "billing",
    name: "Billing (Stripe)",
    health: "operational",
    description: "Plan upgrades, downgrades, and recurring payments.",
  },
];

export const RECENT_INCIDENTS: IncidentEntry[] = [
  // Add new incidents to the TOP of this list. Keep this trimmed to the
  // most recent ~5 — older incidents can move to a historical file later.
];

/** Display labels for the health enum. */
export const HEALTH_LABEL: Record<SystemHealth, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Scheduled maintenance",
};

/** Tailwind class snippets keyed by health. Kept in one place for
 * consistency across pill / dot / banner usages. */
export const HEALTH_STYLES: Record<
  SystemHealth,
  { dot: string; pill: string; ring: string; text: string }
> = {
  operational: {
    dot: "bg-vc-sage",
    pill: "bg-vc-sage/15 text-vc-sage-dark",
    ring: "ring-vc-sage/30",
    text: "text-vc-sage-dark",
  },
  degraded: {
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-900",
    ring: "ring-amber-200",
    text: "text-amber-900",
  },
  outage: {
    dot: "bg-vc-coral",
    pill: "bg-vc-coral/15 text-vc-coral-dark",
    ring: "ring-vc-coral/30",
    text: "text-vc-coral-dark",
  },
  maintenance: {
    dot: "bg-vc-indigo",
    pill: "bg-vc-indigo/10 text-vc-indigo",
    ring: "ring-vc-indigo/20",
    text: "text-vc-indigo",
  },
};
