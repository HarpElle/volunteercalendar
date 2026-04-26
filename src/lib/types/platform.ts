/**
 * Platform admin snapshot types — used to surface per-org activity and health
 * on the Platform Overview, Organizations list, and per-org detail pages.
 *
 * Snapshots are denormalized into `platform/orgs/{churchId}` Firestore docs by
 * the existing `POST /api/platform/stats` recompute path. The detail view may
 * recompute fresh on demand for a single org.
 */

import type { OrgRole, SubscriptionTier } from ".";

/** A signal of where the org sits in its lifecycle. */
export type OrgStatus =
  | "active" // activity within last 14 days
  | "dormant_14d" // no activity 14-29 days
  | "dormant_30d" // no activity 30+ days
  | "abandoned_signup" // created in last 7d, zero activity since
  | "at_risk"; // free tier with paid-feature attempts, or payment_failed

export interface OrgMembershipBreakdown {
  owner: number;
  admin: number;
  scheduler: number;
  volunteer: number;
  pending_invite: number;
  pending_self_join: number;
  inactive: number;
  total_active: number;
}

export interface OrgConfigurationFlags {
  has_services: boolean;
  has_checkin_settings: boolean;
  has_kiosks: boolean; // any printers configured
  has_worship_plans: boolean;
  has_rooms: boolean;
  has_calendar_feeds: boolean;
  has_short_links: boolean;
  has_facility_groups: boolean;
}

export interface OrgConfigurationCounts {
  services: number;
  service_plans: number;
  ministries: number;
  rooms: number;
  short_links: number;
  calendar_feeds: number;
  printers: number;
  checkin_rooms: number;
}

export interface OrgChildrenPresence {
  /** Total Child documents (legacy + unified). */
  children: number;
  /** Total household documents (legacy + unified). */
  households: number;
  /** Number of distinct check-in sessions over all time. */
  sessions_total: number;
  /** Sessions started in the last 24 hours. */
  sessions_24h: number;
  /** Sessions started in the last 7 days. */
  sessions_7d: number;
  /** True if any child has non-empty allergies or medical_notes. No PII surfaced. */
  any_medical_notes_set: boolean;
}

export interface OrgRiskSignals {
  dormant_14d: boolean;
  dormant_30d: boolean;
  dormant_60d: boolean;
  /** Free tier but has check-in settings/children/sessions present. */
  free_tier_paid_feature_attempted: boolean;
  /** Track C wires this when Stripe is live. */
  payment_failed: boolean;
  /** Track C. */
  subscription_past_due: boolean;
  /** Created within last 7 days with no activity since. */
  abandoned_signup: boolean;
}

export interface OrgOwner {
  uid: string | null;
  email: string | null;
  display_name: string | null;
  /** ISO timestamp from Firebase Auth — only populated on detail-view fetch. */
  last_sign_in_at: string | null;
}

export interface OrgSnapshot {
  /** Doc ID matches churchId. */
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  subscription_source: string;
  created_at: string;

  /** Last activity timestamp across all signals; null if nothing has happened. */
  last_active_at: string | null;
  /** Status pill on the Organizations list. */
  status: OrgStatus;

  owner: OrgOwner;
  memberships: OrgMembershipBreakdown;
  configuration: OrgConfigurationFlags;
  counts: OrgConfigurationCounts;
  children_presence: OrgChildrenPresence;
  risk: OrgRiskSignals;

  /** Per-day counts for the last 30 days, used for sparklines on detail page. */
  recent_activity: {
    sessions_by_day: number[]; // length 30, oldest first
    assignments_by_day: number[];
    members_added_by_day: number[];
  };

  computed_at: string;
}

/**
 * Recent-activity rollup shown on the Platform Overview.
 * Stored at `platform/recent_activity`.
 */
export interface RecentActivity {
  /** Top 5 by `last_active_at` desc. */
  most_active: RecentActivityRow[];
  /** Top 5 by `last_active_at` asc among orgs with no activity in 14+ days. */
  dormant: RecentActivityRow[];
  /** Orgs flagged with any non-empty `risk` signal. */
  at_risk: RecentActivityRow[];
  computed_at: string;
}

export interface RecentActivityRow {
  id: string;
  name: string;
  tier: SubscriptionTier;
  last_active_at: string | null;
  status: OrgStatus;
  /** Short human description, e.g. "12 check-ins, 3 plans published". */
  signal: string;
  /** Risk badges to render (if any). */
  risk_badges: Array<keyof OrgRiskSignals>;
}

/** Convenience: the enriched row shown in the Organizations list table. */
export interface OrgListRow {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  subscription_source: string;
  created_at: string;
  // Snapshot-derived fields (may be undefined if snapshot missing)
  last_active_at?: string | null;
  status?: OrgStatus;
  member_count?: number;
  member_breakdown?: OrgMembershipBreakdown;
  has_checkin?: boolean;
  kiosk_count?: number;
  children_count?: number;
  sessions_7d?: number;
  risk_badges?: Array<keyof OrgRiskSignals>;
}

/** Helper: roles enumerated with stable order for charting. */
export const ORG_ROLES_ORDERED: OrgRole[] = [
  "owner",
  "admin",
  "scheduler",
  "volunteer",
];
