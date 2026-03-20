/* VolunteerCal — Core Type Definitions */

// --- Auth & Users ---

/** @deprecated Use OrgRole on Membership instead */
export type UserRole = "admin" | "team_lead" | "volunteer";

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  phone: string | null;
  /** Primary/last-used org. Null if not yet joined any org. */
  default_church_id: string | null;
  /** @deprecated Use Membership.role instead. Kept for backward compat during migration. */
  church_id?: string;
  /** @deprecated Use Membership.role instead. Kept for backward compat during migration. */
  role?: UserRole;
  /** @deprecated Use Membership ministry_scope instead. */
  ministry_ids?: string[];
  /** Blockout dates shared across all orgs */
  global_availability: GlobalAvailability;
  created_at: string;
}

export interface GlobalAvailability {
  blockout_dates: string[];
  recurring_unavailable: string[];
}

// --- Memberships (Multi-Org Identity) ---

export type OrgRole = "owner" | "admin" | "scheduler" | "volunteer";

export type MembershipStatus =
  | "pending_volunteer_approval" // org invited volunteer, awaiting their acceptance
  | "pending_org_approval"       // volunteer self-registered, awaiting admin approval
  | "active"
  | "inactive";

export interface Membership {
  id: string;
  user_id: string;
  church_id: string;
  role: OrgRole;
  /** For scheduler role: which ministry IDs they can manage. Empty array = all. */
  ministry_scope: string[];
  status: MembershipStatus;
  /** User ID of whoever sent the invite, or null for self-registration */
  invited_by: string | null;
  /** Link to the church's volunteer record once activated */
  volunteer_id: string | null;
  /** Per-org reminder preferences */
  reminder_preferences: {
    channels: ReminderChannel[];
  };
  created_at: string;
  updated_at: string;
}

// --- Churches (Tenants) ---

export type WorkflowMode =
  | "centralized"
  | "ministry-first"
  | "hybrid"
  | "self-service";

export type SubscriptionTier =
  | "free"
  | "starter"
  | "growth"
  | "pro"
  | "enterprise";

export type OrgType = "church" | "nonprofit" | "other";

export interface Church {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  workflow_mode: WorkflowMode;
  timezone: string;
  subscription_tier: SubscriptionTier;
  stripe_customer_id: string | null;
  settings: ChurchSettings;
  created_at: string;
}

export interface ChurchSettings {
  default_schedule_range_weeks: number;
  default_reminder_channels: ReminderChannel[];
  require_confirmation: boolean;
}

// --- Campuses (Multi-Site) ---

export interface Campus {
  id: string;
  church_id: string;
  name: string;
  /** Physical address */
  address: string | null;
  /** Lat/lng for geofencing (QR check-in) */
  location: { lat: number; lng: number } | null;
  /** Timezone override. Null = inherits from org. */
  timezone: string | null;
  /** Whether this is the primary/main campus */
  is_primary: boolean;
  created_at: string;
}

// --- Onboarding / Journey Tracking ---

export type OnboardingStepType =
  | "class"              // e.g., "Get Anchored" membership class
  | "background_check"   // cleared background check
  | "minimum_service"    // served X times in another ministry
  | "ministry_tenure"    // active in a prerequisite ministry for N days
  | "custom";            // admin-defined freeform requirement

export interface OnboardingStep {
  id: string;
  /** Human-readable label (e.g., "Complete Get Anchored class") */
  label: string;
  type: OnboardingStepType;
  /** For "class": class name. For "ministry_tenure"/"minimum_service": ministry_id. */
  reference_id?: string | null;
  /** For "minimum_service": minimum number of times served. For "ministry_tenure": minimum days. */
  threshold?: number | null;
}

export type JourneyStepStatus = "pending" | "in_progress" | "completed" | "waived";

export interface VolunteerJourneyStep {
  step_id: string;
  /** Which ministry's prerequisite this satisfies */
  ministry_id: string;
  status: JourneyStepStatus;
  completed_at?: string | null;
  /** Admin who waived or verified completion */
  verified_by?: string | null;
  notes?: string | null;
}

// --- Ministries ---

export interface Ministry {
  id: string;
  church_id: string;
  name: string;
  color: string;
  description: string;
  lead_user_id: string;
  lead_email: string;
  /** Whether volunteers must have a cleared background check to serve in this ministry */
  requires_background_check?: boolean;
  /** Prerequisites volunteers must complete before serving in this ministry */
  prerequisites?: OnboardingStep[];
  created_at: string;
}

// --- Role Slots (shared by Services and Events) ---

export interface RoleSlot {
  role_id: string;
  title: string;
  count: number;
  /** Which ministry this role belongs to (null = general/org-wide) */
  ministry_id: string | null;
  /** Can volunteers self-signup for this slot? */
  allow_signup: boolean;
  /** Per-role start time override (HH:mm). Null = inherits from service/event. */
  start_time: string | null;
  /** Per-role end time override (HH:mm). Null = inherits from service/event. */
  end_time: string | null;
  /** Always schedule this volunteer first for this role (unless unavailable) */
  pinned_volunteer_id?: string | null;
}

/** @deprecated Use RoleSlot instead. Kept as alias for backward compat. */
export interface ServiceRole {
  role_id: string;
  title: string;
  count: number;
  /** Per-role start time (HH:mm). Null = same as service start_time. */
  start_time?: string | null;
  /** Per-role end time (HH:mm). Null = derived from service duration. */
  end_time?: string | null;
  /** Always schedule this volunteer first for this role (unless unavailable) */
  pinned_volunteer_id?: string | null;
}

// --- Services ---

export type RecurrencePattern = "weekly" | "biweekly" | "monthly" | "custom";

/** A ministry's participation in a service, with its own roles and optional time overrides. */
export interface ServiceMinistry {
  ministry_id: string;
  roles: ServiceRole[];
  /** Per-ministry start time override (HH:mm). Null = inherits from service. */
  start_time: string | null;
  /** Per-ministry end time override (HH:mm). Null = inherits from service. */
  end_time: string | null;
}

export interface Service {
  id: string;
  church_id: string;
  /** @deprecated Primary ministry. Use `ministries` array for multi-ministry services. */
  ministry_id: string;
  /** Campus this service belongs to. Null = all campuses / org-wide. */
  campus_id?: string | null;
  name: string;
  recurrence: RecurrencePattern;
  day_of_week: number;
  /** Default start time for the service (HH:mm). Ministries/roles may override. */
  start_time: string;
  /** Default end time for the service (HH:mm). Null = use duration_minutes. */
  end_time: string | null;
  /** @deprecated Prefer end_time. Kept for backward compat. */
  duration_minutes: number;
  /** Whether this is an all-day service (no specific times). */
  all_day: boolean;
  /** @deprecated Flat role list for legacy single-ministry services. Use ministries[].roles instead. */
  roles: ServiceRole[];
  /** Multi-ministry support. Each entry has its own roles and optional time overrides. */
  ministries?: ServiceMinistry[];
  created_at: string;
}

// --- Events ---

export type EventType = "one_time" | "recurring";
export type EventVisibility = "internal" | "public";
export type SignupMode = "open" | "scheduled" | "hybrid";

export interface EventPromotion {
  send_email_blast: boolean;
  send_sms_blast: boolean;
  qr_code_url: string | null;
  signup_url: string | null;
}

export interface Event {
  id: string;
  church_id: string;
  name: string;
  description: string;
  event_type: EventType;
  visibility: EventVisibility;
  signup_mode: SignupMode;
  date: string;
  /** Default start time (HH:mm). Null if all_day. Roles may override. */
  start_time: string | null;
  /** Default end time (HH:mm). Null if all_day. Roles may override. */
  end_time: string | null;
  /** Whether this is an all-day event (no specific times). */
  all_day: boolean;
  /** @deprecated Prefer end_time. */
  duration_minutes: number;
  recurrence: RecurrencePattern | null;
  day_of_week: number | null;
  roles: RoleSlot[];
  ministry_ids: string[];
  promotion: EventPromotion;
  created_by: string;
  created_at: string;
}

// --- Volunteers ---

export type ReminderChannel = "email" | "sms" | "calendar" | "none";
export type ImportSource =
  | "csv"
  | "planning_center"
  | "breeze"
  | "rock"
  | "manual"
  | "self_signup"
  | "invite";

export type VolunteerStatus = "active" | "inactive" | "pending";

export interface VolunteerAvailability {
  blockout_dates: string[];
  recurring_unavailable: string[];
  preferred_frequency: number;
  max_roles_per_month: number;
}

export interface VolunteerStats {
  times_scheduled_last_90d: number;
  last_served_date: string | null;
  decline_count: number;
  no_show_count: number;
}

/** Conditional role dependency — e.g., Vocals requires Guitar or Keys */
export interface ConditionalRole {
  /** The role that has a dependency (e.g., Vocals role_id) */
  role_id: string;
  /** Must also be assigned one of these roles in the same service (e.g., [Guitar, Keys]) */
  requires_any: string[];
}

export interface Volunteer {
  id: string;
  church_id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  /** Link to the membership doc for logged-in volunteers */
  membership_id: string | null;
  status: VolunteerStatus;
  ministry_ids: string[];
  role_ids: string[];
  /** Campus IDs this volunteer can serve at. Empty = all campuses. */
  campus_ids?: string[];
  household_id: string | null;
  availability: VolunteerAvailability;
  reminder_preferences: {
    channels: ReminderChannel[];
  };
  stats: VolunteerStats;
  imported_from: ImportSource;
  /** Background check status for ministries that require clearance */
  background_check?: {
    status: "cleared" | "pending" | "expired" | "not_required";
    expires_at?: string | null;
    provider?: string | null;
    checked_at?: string | null;
  };
  /** Advanced role constraints for worship/music teams */
  role_constraints?: {
    /** Roles this volunteer can only fill if also assigned a companion role */
    conditional_roles?: ConditionalRole[];
    /** Allow this volunteer to fill multiple role slots in the same service */
    allow_multi_role?: boolean;
  };
  /** Onboarding journey steps completed/pending for this volunteer */
  volunteer_journey?: VolunteerJourneyStep[];
  created_at: string;
}

// --- Households ---

export interface Household {
  id: string;
  church_id: string;
  name: string;
  volunteer_ids: string[];
  constraints: {
    never_same_service: boolean;
    prefer_same_service: boolean;
  };
}

// --- Schedules ---

export type ScheduleStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface MinistryApproval {
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
}

export interface Schedule {
  id: string;
  church_id: string;
  date_range_start: string;
  date_range_end: string;
  status: ScheduleStatus;
  workflow_mode: WorkflowMode;
  created_by: string;
  created_at: string;
  published_at: string | null;
  ministry_approvals: Record<string, MinistryApproval>;
  /** Free-form notes for this schedule period (set lists, resource links, etc.) */
  notes?: string | null;
}

// --- Assignments ---

export type AssignmentStatus =
  | "draft"
  | "confirmed"
  | "declined"
  | "no_show"
  | "substitute_requested";

export type SignupType = "scheduled" | "self_signup";

export interface Assignment {
  id: string;
  schedule_id: string;
  church_id: string;
  /** Null for event-only assignments */
  service_id: string | null;
  /** Null for service-only assignments */
  event_id: string | null;
  service_date: string;
  volunteer_id: string;
  role_id: string;
  role_title: string;
  ministry_id: string;
  status: AssignmentStatus;
  signup_type: SignupType;
  confirmation_token: string;
  responded_at: string | null;
  reminder_sent_at: string[];
  /** Attendance: null = not yet marked, true = present, false = no-show */
  attended: boolean | null;
  /** ISO timestamp when attendance was marked */
  attended_at: string | null;
  /** True if this assignment was auto-created after another volunteer declined */
  auto_rescheduled?: boolean;
  /** Volunteer ID of the person who declined, triggering this auto-reschedule */
  replaced_volunteer_id?: string;
}

// --- Calendar Feeds ---

export type CalendarFeedType = "personal" | "team" | "ministry" | "org";

export interface CalendarFeed {
  id: string;
  church_id: string;
  type: CalendarFeedType;
  target_id: string;
  secret_token: string;
  created_at: string;
}

// --- Short Links ---

export interface ShortLink {
  id: string;
  church_id: string;
  /** User-chosen slug, e.g. "easter-signup". URL: /s/{slug} */
  slug: string;
  /** Full destination URL (absolute path like /join/{churchId} or /events/{churchId}/{eventId}/signup) */
  target_url: string;
  /** Human label shown in dashboard */
  label: string;
  created_by: string;
  created_at: string;
  expires_at: string;
}

// --- Waitlist ---

export interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  church_name: string;
  team_size: number;
  current_tool: string;
  workflow_preference: string;
  phone: string | null;
  created_at: string;
}

// --- Scheduling Algorithm ---

export type ConflictType =
  | "unfilled_role"
  | "overbooked"
  | "availability_violation"
  | "household_conflict"
  | "low_confidence";

export interface ScheduleConflict {
  type: ConflictType;
  service_id: string;
  service_date: string;
  role_id?: string;
  volunteer_id?: string;
  message: string;
}

export interface SchedulingResult {
  assignments: Omit<Assignment, "id" | "confirmation_token" | "responded_at" | "reminder_sent_at">[];
  conflicts: ScheduleConflict[];
  stats: {
    total_slots: number;
    filled_slots: number;
    fill_rate: number;
    fairness_score: number;
  };
}

// --- Event Signups ---

export type SignupStatus = "confirmed" | "waitlisted" | "cancelled";

export interface EventSignup {
  id: string;
  event_id: string;
  church_id: string;
  role_id: string;
  role_title: string;
  volunteer_id: string;
  /** User ID of the volunteer (for logged-in self-signup) */
  user_id: string | null;
  volunteer_name: string;
  volunteer_email: string;
  status: SignupStatus;
  signed_up_at: string;
  /** Admin who approved, or null for auto-approved open signups */
  approved_by: string | null;
  /** Attendance: null = not yet marked, true = present, false = no-show */
  attended: boolean | null;
  /** ISO timestamp when attendance was marked */
  attended_at: string | null;
}

// --- Sent Notifications (Tracking) ---

export type NotificationType = "confirmation" | "reminder_48h" | "reminder_24h" | "custom";
export type NotificationChannel = "email" | "sms";
export type NotificationStatus = "sent" | "delivered" | "failed" | "bounced";

export interface SentNotification {
  id: string;
  church_id: string;
  volunteer_id: string;
  volunteer_name: string;
  volunteer_email: string;
  volunteer_phone: string | null;
  assignment_id: string | null;
  schedule_id: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  /** Error message if status is 'failed' */
  error_message: string | null;
  /** External ID from Resend or Twilio */
  external_id: string | null;
  sent_at: string;
}

/** A service occurrence on a specific date */
export interface ServiceOccurrence {
  service: Service;
  date: string;
}

// ---------------------------------------------------------------------------
// Swap Requests (Shift Swap Engine)
// ---------------------------------------------------------------------------

export type SwapRequestStatus =
  | "open"            // volunteer requested, waiting for a replacement to accept
  | "pending_admin"   // replacement accepted, waiting for admin approval
  | "approved"        // admin approved, assignment transferred
  | "auto_approved"   // auto-approved (org setting), assignment transferred
  | "cancelled"       // requester cancelled
  | "expired";        // no one picked it up before the service date

export interface SwapRequest {
  id: string;
  church_id: string;
  assignment_id: string;
  schedule_id: string;
  service_id: string;
  service_date: string;
  role_id: string;
  role_title: string;
  ministry_id: string;
  /** Volunteer who can't make it */
  requester_volunteer_id: string;
  requester_name: string;
  /** Volunteer who offered to take the shift */
  replacement_volunteer_id: string | null;
  replacement_name: string | null;
  status: SwapRequestStatus;
  /** Optional message from the requester */
  reason: string | null;
  /** Admin who approved/rejected */
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Invite Queue (Phase 4 — bulk import review)
// ---------------------------------------------------------------------------

export type InviteQueueStatus =
  | "pending_review"
  | "approved"
  | "skipped"
  | "sent"
  | "failed";

export type InviteQueueSource = "csv" | "chms" | "individual";

export interface InviteQueueItem {
  id: string;
  church_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: OrgRole;
  ministry_ids: string[];
  source: InviteQueueSource;
  source_provider?: string;
  status: InviteQueueStatus;
  volunteer_id: string | null;
  error_message: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  created_at: string;
}
