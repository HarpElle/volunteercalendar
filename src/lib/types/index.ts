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
  /** Profile photo URL (Firebase Storage) */
  photo_url?: string | null;
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
  /** Scheduler/admin notification preferences. Only relevant for scheduler+ roles. */
  scheduler_notification_preferences?: SchedulerNotificationPreferences;
  /** Grants access to check-in dashboard, households, children, reports without full scheduler role */
  checkin_volunteer?: boolean;
  /** Grants access to event management without full admin role */
  event_coordinator?: boolean;
  /** Grants access to room/resource management without full admin role */
  facility_coordinator?: boolean;
  /**
   * Pass H Phase 1: per-membership campus preference. When the user
   * switches campus via the sidebar selector, this is persisted to the
   * membership doc so the same campus is selected next time they log in
   * from a different device. Null/undefined = "All campuses" (default).
   * Only meaningful when the org has 2+ campuses.
   */
  default_campus_id?: string | null;
  created_at: string;
  updated_at: string;
}

// --- Scheduler Notification Preferences ---

export type SchedulerNotificationType =
  | "assignment_change"
  | "absence_alert"
  | "swap_request"
  | "self_removal"
  | "schedule_published";

export interface SchedulerNotificationPreferences {
  /** Which notification types this scheduler wants to receive */
  enabled_types: SchedulerNotificationType[];
  /** Delivery channels by urgency */
  channels: {
    /** Standard notifications (assignment changes, schedule published) */
    standard: ("email" | "none")[];
    /** Urgent notifications (absences, swap requests, self-removals) */
    urgent: ("email" | "sms" | "none")[];
  };
  /** Only receive for specific ministry IDs. Empty = all ministries. */
  ministry_scope: string[];
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

export type SubscriptionSource = "stripe" | "manual";

/** Billing cadence of a paid subscription (Wave 6 — annual billing). */
export type SubscriptionInterval = "month" | "year";

export interface Church {
  id: string;
  name: string;
  slug: string;
  /** 6-char uppercase alphanumeric code for manual kiosk setup entry */
  short_code: string;
  org_type: OrgType;
  workflow_mode: WorkflowMode;
  timezone: string;
  subscription_tier: SubscriptionTier;
  /** How the tier was set — absent defaults to "stripe" */
  subscription_source?: SubscriptionSource;
  /** Billing cadence of the active paid subscription (Wave 6). Absent = monthly (legacy subs). */
  subscription_interval?: SubscriptionInterval;
  stripe_customer_id: string | null;
  settings: ChurchSettings;
  /** Org-wide prerequisites that apply to ALL teams */
  org_prerequisites?: OnboardingStep[];
  /** CCLI Church Copyright License number */
  ccli_number: string | null;
  /** ISO timestamp when the CCLI attestation checkbox was accepted */
  ccli_attestation_at: string | null;
  /** Feature flags derived from subscription_tier, with manual override support */
  feature_flags?: FeatureFlags;
  /** Denormalized count of people in the people collection (for tier limit enforcement) */
  person_count?: number;
  created_at: string;
}

/** Sentinel ministry_id used for org-wide prerequisite journey steps */
export const ORG_WIDE_MINISTRY_ID = "__org__";

export interface ChurchSettings {
  default_schedule_range_weeks: number;
  default_reminder_channels: ReminderChannel[];
  require_confirmation: boolean;
  /** Whether volunteers can self-check-in from the app without QR code */
  self_check_in_enabled?: boolean;
  /** Minutes before service start to open check-in window */
  check_in_window_before?: number;
  /** Minutes after service start to keep check-in window open */
  check_in_window_after?: number;
  /** Whether proximity-based check-in is active */
  proximity_check_in_enabled?: boolean;
  /** Geofence radius in meters */
  proximity_radius_meters?: number;
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
  | "shadow"             // shadow a team member before serving independently
  | "custom"
  | "header";            // admin-defined freeform requirement

/** Where this prerequisite applies. Absent defaults to "all" (backward-compatible). */
export type PrerequisiteScope = "all" | "teams" | "events" | "specific_roles";

export interface OnboardingStep {
  id: string;
  /** Human-readable label (e.g., "Complete Get Anchored class") */
  label: string;
  type: OnboardingStepType;
  /** For "class": class name. For "ministry_tenure"/"minimum_service": ministry_id. */
  reference_id?: string | null;
  /** For "minimum_service": minimum number of times served. For "ministry_tenure": minimum days. */
  threshold?: number | null;
  /** Where this prerequisite applies. Defaults to "all" if absent. */
  scope?: PrerequisiteScope;
  /** When scope is "specific_roles": which role IDs this prereq applies to. */
  role_ids?: string[];
  /**
   * Days after completion before this step expires (e.g. 365 for a
   * background check). When set, completion writes
   * VolunteerJourneyStep.expires_at = completed_at + expires_in_days. Null
   * or undefined means the completion never expires.
   *
   * Codex Phase 6 2026-05-18.
   */
  expires_in_days?: number | null;
}

export type JourneyStepStatus = "pending" | "in_progress" | "completed" | "waived";

export interface VolunteerJourneyStep {
  step_id: string;
  /** Which ministry's prerequisite this satisfies */
  ministry_id: string;
  status: JourneyStepStatus;
  completed_at?: string | null;
  /** ISO date when this step expires (background checks, certifications) */
  expires_at?: string | null;
  /** Admin who waived or verified completion */
  verified_by?: string | null;
  notes?: string | null;
}

// --- Training Sessions ---

export type TrainingSessionStatus = "scheduled" | "completed" | "cancelled";

export interface TrainingSessionRsvp {
  volunteer_id: string;
  status: "accepted" | "declined";
  responded_at: string;
}

export interface TrainingSession {
  id: string;
  church_id: string;
  /** The prerequisite step this session satisfies (from OnboardingStep.id) */
  prerequisite_step_id: string;
  /** Ministry that owns this prerequisite (or __org__ for org-wide) */
  ministry_id: string;
  title: string;
  /** ISO date string */
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  /** When true, attending auto-completes the linked prerequisite step */
  auto_complete: boolean;
  status: TrainingSessionStatus;
  rsvps: TrainingSessionRsvp[];
  /** Volunteer IDs marked as attended (set when session is completed) */
  attendee_ids: string[];
  created_by: string;
  created_at: string;
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
  /**
   * Category tag from the setup wizard's `CHURCH_MINISTRY_TEMPLATES`.
   * Optional because legacy ministries may not carry it. The Wave 9 P0-3
   * children-restriction enforcement keys off `category === "children_youth"`
   * — see `isChildrenMinistry()` in `src/lib/services/scheduler.ts`.
   * Allowed values mirror `MINISTRY_CATEGORY_LABELS` in
   * `src/lib/constants/index.ts`:
   *   "worship" | "children_youth" | "hospitality" |
   *   "operations" | "outreach" | "fellowship"
   * Stored as plain string so future categories don't break the type.
   */
  category?: string;
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

/** A ministry assignment within a service profile, with effective date range for timeline changes. */
export interface MinistryAssignment {
  ministry_id: string;
  roles: ServiceRole[];
  /** Per-ministry start time override (HH:mm). Null = inherits from service. */
  start_time: string | null;
  /** Per-ministry end time override (HH:mm). Null = inherits from service. */
  end_time: string | null;
  /** True = always included in schedules; false = optional per-occurrence (ad-hoc team). */
  is_default: boolean;
  /** ISO date when this assignment becomes effective. */
  effective_from: string;
  /** ISO date when this assignment expires. Null = open-ended (current). */
  effective_until: string | null;
  created_at: string;
  updated_by: string;
}

export type ServiceChangeType =
  | "ministry_added"
  | "ministry_removed"
  | "role_modified"
  | "time_changed"
  | "recurrence_changed";

/** Audit trail entry for a service profile change. */
export interface ServiceChangeRecord {
  change_type: ServiceChangeType;
  effective_from: string;
  previous_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  changed_by: string;
  changed_at: string;
}

/** Scope for service profile edits with effective-from logic. */
export type EditScope = "next" | "from_date" | "single_date";

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
  /** Timeline-based ministry assignments with effective dates. Takes precedence over ministries[] when populated. */
  ministry_assignments?: MinistryAssignment[];
  /** Audit trail of service profile changes. */
  change_history?: ServiceChangeRecord[];
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
  /**
   * Pass H Phase 4: campus this event belongs to.
   *   - null / undefined  → org-wide event, universal (visible under every
   *                          campus view; same semantic as Service.campus_id
   *                          null and Person.campus_ids === []).
   *   - non-null          → event is scoped to that specific campus.
   *
   * Used by Service Day to filter the Upcoming Events list, by the public
   * signup page to render a campus chip, by the confirmation email to
   * include campus name, and by personal iCal feeds to scope by campus.
   */
  campus_id?: string | null;
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

// --- Households ---

export interface Household {
  id: string;
  church_id: string;
  name: string;
  volunteer_ids: string[];
  constraints: {
    never_same_service: boolean;
    prefer_same_service: boolean;
    /** Hard constraint: no household members assigned to any service on the same date. */
    never_same_time: boolean;
  };
  notes?: string | null;
  created_at?: string;
  updated_by?: string | null;
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

export interface AvailabilityWindow {
  /** Deadline for volunteers to update availability. */
  due_date: string;
  /** Optional message included in the broadcast email. */
  message: string | null;
  /** Timestamp when the reminder email was sent. */
  reminder_sent_at: string | null;
  /** Denormalized count of volunteers who updated availability. */
  response_count: number;
}

export interface ApprovalWorkflow {
  /** Target date for all ministries to complete review. */
  target_approval_date: string | null;
  started_at: string;
  approved_at: string | null;
  conflict_summary: {
    total_conflicts: number;
    unfilled_slots: { role_id: string; count: number }[];
    household_conflicts: { volunteer_ids: string[]; reason: string }[];
  } | null;
}

export interface ScheduleMeta {
  fairness_score: number;
  fill_rate: number;
  confirmation_rate: number | null;
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
  /** Availability window campaign for centralized/hybrid workflows. */
  availability_window?: AvailabilityWindow;
  /** Multi-stage approval workflow state. */
  approval_workflow?: ApprovalWorkflow;
  /** Scheduling quality metrics. */
  meta?: ScheduleMeta;
  /** Ministry IDs this schedule was scoped to. Empty/undefined = all ministries. */
  ministry_ids?: string[];
}

// --- Attendance ---

/** Attendance status: null = not yet marked */
export type AttendanceStatus = "present" | "no_show" | "excused" | null;

/** Normalize legacy boolean attendance values to the string enum */
export function normalizeAttendance(value: boolean | string | null | undefined): AttendanceStatus {
  if (value === true || value === "present") return "present";
  if (value === false || value === "no_show") return "no_show";
  if (value === "excused") return "excused";
  return null;
}

// --- Assignments ---

export type AssignmentStatus =
  | "draft"
  | "confirmed"
  | "declined"
  | "no_show"
  | "substitute_requested";

export type SignupType = "scheduled" | "self_signup";

export type AssignmentType = "regular" | "trainee";

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
  /** Unified Person ID. During migration, falls back to volunteer_id. */
  person_id: string;
  role_id: string;
  role_title: string;
  ministry_id: string;
  status: AssignmentStatus;
  /**
   * Denormalized parent schedule status (Wave 2.2, 2026-05-26). Kept in
   * sync by:
   *   - schedule generation (initial value mirrors the new schedule's status,
   *     usually "draft")
   *   - /api/schedules/{id}/publish + /approve (fan-out to all child assignments)
   *   - /api/assignments/claim (inherits parent's status at claim time)
   *
   * Optional during the migration window: legacy assignments backfilled by
   * scripts/backfill-assignment-schedule-status.ts. Firestore rule treats a
   * missing value as not-readable-by-volunteers, so backfill MUST complete
   * before the tightened rule deploys.
   */
  schedule_status?: ScheduleStatus;
  signup_type: SignupType;
  /** "trainee" = shadow/observe, does not fill a role slot */
  assignment_type?: AssignmentType;
  confirmation_token: string;
  responded_at: string | null;
  reminder_sent_at: string[];
  /** Attendance status */
  attended: AttendanceStatus;
  /** ISO timestamp when attendance was marked */
  attended_at: string | null;
  /** How the volunteer checked in */
  check_in_method?: "qr" | "self" | "proximity" | "manual" | null;
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
  label?: string;
  /** Firebase Auth UID of the user who created this feed. Authoritative owner; required for permission checks. */
  created_by_user_id: string;
  /** Person doc ID linked to the creator, when known. Lets schedulers see "I created this for Alex" without exposing it to other users. */
  created_by_person_id?: string;
  /**
   * Pass G Phase 3: when set, the feed is revoked and all calendar API
   * endpoints return 404 (the iCal client sees the subscription disappear).
   * Revocation is irreversible — user must create a new feed if they
   * change their mind. Different from regenerating the token (which
   * keeps the feed alive with a new secret_token).
   */
  revoked_at?: string;
  /**
   * Pass G Phase 3: write-on-read timestamp set by every successful
   * /api/calendar/* response that uses this feed's token. Surfaced in
   * the account page so users can detect unexpected access (e.g. a
   * shared token being used by someone they didn't intend).
   */
  last_accessed_at?: string;
  /**
   * Pass H Phase 4: per-feed campus scope.
   *   - null / undefined → feed includes assignments + events from every
   *                         campus the target_id touches (status quo).
   *   - non-null         → feed only includes items whose campus_id
   *                         matches this value (or items with no
   *                         campus_id, which are treated as universal).
   *
   * Lets a volunteer who serves at multiple campuses create one personal
   * calendar feed per campus and subscribe to each from a different
   * calendar (e.g. one for North work, one for South work). Defaults to
   * null on every existing feed so nothing breaks.
   */
  campus_id?: string | null;
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

export interface ScheduleStats {
  total_slots: number;
  filled_slots: number;
  unfilled_slots: number;
  fill_rate: number;
  fairness_score: number;
  unique_volunteers: number;
  by_status: {
    confirmed: number;
    pending: number;
    declined: number;
  };
}

export interface SchedulingResult {
  assignments: Omit<Assignment, "id" | "confirmation_token" | "responded_at" | "reminder_sent_at">[];
  conflicts: ScheduleConflict[];
  stats: ScheduleStats;
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
  /** Attendance status */
  attended: AttendanceStatus;
  /** ISO timestamp when attendance was marked */
  attended_at: string | null;
}

// --- Sent Notifications (Tracking) ---

export type NotificationType = "confirmation" | "reminder_48h" | "reminder_24h" | "custom" | "absence_alert";
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

// ---------------------------------------------------------------------------
// User Notification Center
// ---------------------------------------------------------------------------

export type UserNotificationType =
  | "schedule_assignment"
  | "reminder"
  | "assignment_change"
  | "replacement_assignment"
  | "swap_request"
  | "swap_resolved"
  | "membership_approved"
  | "role_promotion"
  | "prerequisite_milestone"
  | "prerequisite_expiry"
  | "absence_alert"
  | "self_removal_alert"
  /** Admin sent an Availability Window request — volunteer should submit
   * their availability before the schedule is generated. Codex Run 3 retest
   * (2026-05-17): added so the banner on /dashboard/my-schedule can surface. */
  | "availability_request";

export interface UserNotification {
  id: string;
  user_id: string;
  church_id: string;
  type: UserNotificationType;
  title: string;
  body: string;
  /** Structured data for deep-linking and display: link_href, schedule_id, etc. */
  metadata: Record<string, string | null>;
  read: boolean;
  created_at: string;
  expires_at: string;
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

// ---------------------------------------------------------------------------
// Worship Module — Structured Chord Chart Data
// ---------------------------------------------------------------------------

/** A single chord-lyric pair within a chart line. */
export interface ChordSegment {
  /** Chord symbol (e.g., "G", "C2", "D/F#") or null for lyric-only segments. */
  chord: string | null;
  /** Lyrics text that follows this chord position. */
  lyrics: string;
}

/** A single line in a chart section, composed of chord-lyric segments. */
export interface ChartLine {
  segments: ChordSegment[];
}

export type SectionType =
  | "verse"
  | "chorus"
  | "pre-chorus"
  | "bridge"
  | "intro"
  | "outro"
  | "ending"
  | "interlude"
  | "tag"
  | "instrumental"
  | "vamp"
  | "turnaround"
  | "misc";

/** A labeled section (e.g., "Verse 1", "Chorus") containing lines of chords + lyrics. */
export interface ChartSection {
  /** Unique within this chart. */
  id: string;
  type: SectionType;
  /** Display label, e.g., "Verse 1", "Chorus", "Ending". */
  label: string;
  lines: ChartLine[];
}

/** Structured JSON representation of a chord chart — optimized for transposition, editing, and rendering. */
export interface SongChartData {
  metadata: {
    title: string;
    artist: string | null;
    writers: string | null;
    original_key: string | null;
    tempo: number | null;
    /** e.g., "4/4", "3/4", "6/8" */
    time_signature: string | null;
    ccli_number: string | null;
    copyright: string | null;
  };
  sections: ChartSection[];
}

/** Chord notation system for chart display. */
export type ChartType = "standard" | "nashville" | "solfege_fixed" | "solfege_movable";

/** Per-arrangement display formatting preferences. */
export interface ArrangementFormatting {
  columns: 1 | 2;
  /** Font size multiplier (default 1.0). */
  font_scale: number;
  heading_bold: boolean;
  chord_highlight: boolean;
  /** Target number of pages to fit content into (null = auto). */
  fit_pages: number | null;
}

/** A saved arrangement of a song — stores key, chart data, and display prefs. */
export interface SongArrangement {
  id: string;
  song_id: string;
  church_id: string;
  /** e.g., "Key of G — Original", "Key of A — Easier" */
  name: string;
  /** Current key for this arrangement. */
  key: string;
  chart_type: ChartType;
  chart_data: SongChartData;
  formatting: ArrangementFormatting;
  /** Firebase Storage path to PDF file for this arrangement (PDF-based songs only). */
  file_url: string | null;
  /** Source format: "chordpro" charts have transposable data, "pdf" charts display the stored file. */
  source_type: "chordpro" | "pdf";
  notes: string | null;
  /** One arrangement per song should be the default. */
  is_default: boolean;
  created_at: string;
  updated_by: string;
}

// ---------------------------------------------------------------------------
// Worship Module — Songs
// ---------------------------------------------------------------------------

export type SongStatus = "active" | "archived" | "retired";
export type LyricSource = "manual" | "songselect" | "ccli" | "other";

export interface Song {
  id: string;
  church_id: string;
  title: string;
  ccli_number: string | null;
  ccli_publisher: string | null;
  default_key: string | null;
  available_keys: string[];
  artist_credit: string | null;
  writer_credit: string | null;
  copyright: string | null;
  tags: string[];
  in_rotation: boolean;
  rotation_lists: string[];
  lyric_source: LyricSource | null;
  lyrics: string | null;
  /** Structured chord chart data (null for lyrics-only songs). */
  chart_data: SongChartData | null;
  /** Firebase Storage path to the original uploaded file (.pro/.chordpro/PDF). */
  original_file_url: string | null;
  original_file_type: "chordpro" | "pdf" | null;
  /** BPM */
  tempo: number | null;
  /** e.g., "4/4", "3/4", "6/8" */
  time_signature: string | null;
  chord_chart_url: string | null;
  sheet_music_url: string | null;
  media_file_url: string | null;
  /** External SongSelect ID for re-sync. */
  songselect_id: string | null;
  date_added: string;
  last_used_date: string | null;
  /** Denormalized total usage count. */
  use_count: number;
  status: SongStatus;
  notes: string | null;
  created_at: string;
  updated_by: string;
}

// ---------------------------------------------------------------------------
// Worship Module — Service Plans (Order of Service)
// ---------------------------------------------------------------------------

export type ServicePlanItemType =
  | "song"
  | "prayer"
  | "announcement"
  | "sermon"
  | "offering"
  | "video"
  | "custom"
  | "header";

export interface ServicePlanItem {
  /** Unique within this plan. */
  id: string;
  sequence: number;
  type: ServicePlanItemType;
  /** Reference to Song.id (for song items). */
  song_id: string | null;
  /** Key override for this performance (e.g., "D"). Null = use song default. */
  key: string | null;
  /** Reference to a specific SongArrangement.id. Null = use default arrangement. */
  arrangement_id: string | null;
  /** Title for non-song items, or override for song display. */
  title: string | null;
  duration_minutes: number | null;
  arrangement_notes: string | null;
  notes: string | null;
  include_in_program_notes: boolean;
  created_at: string;
  updated_by: string;
}

export interface StageSyncState {
  enabled: boolean;
  /** Current item being displayed on stage. */
  current_item_id: string | null;
  current_item_index: number;
  conductor_user_id: string | null;
  last_advanced_at: string | null;
  /** Unguessable token for public access (token IS the auth). */
  access_token: string;
  /** Denormalized count of connected participant devices. */
  viewers_connected: number;
}

export interface ServicePlan {
  id: string;
  church_id: string;
  /** Reference to the recurring Service this plan is for. */
  service_id: string;
  service_date: string;
  theme: string | null;
  speaker: string | null;
  scripture_references: string[];
  notes: string | null;
  items: ServicePlanItem[];
  published: boolean;
  published_at: string | null;
  stage_sync: StageSyncState | null;
  created_at: string;
  updated_by: string;
}

// ---------------------------------------------------------------------------
// Worship Module — Song Usage Tracking
// ---------------------------------------------------------------------------

export interface SongUsageRecord {
  id: string;
  church_id: string;
  song_id: string;
  service_plan_id: string;
  service_date: string;
  service_name: string;
  song_title: string;
  ccli_number: string | null;
  key_used: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Children's Check-In Module
// ---------------------------------------------------------------------------

// ─── CheckIn Household ───────────────────────────────────────────────────────
// Separate from the scheduling Household (line ~449) which tracks volunteer
// family constraints. This represents families with children for check-in.
// Firestore: churches/{churchId}/checkin_households/{id}

export interface CheckInHousehold {
  id: string;
  church_id: string;
  primary_guardian_name: string;
  primary_guardian_phone: string; // E.164 format: "+15125551234"
  secondary_guardian_name?: string;
  secondary_guardian_phone?: string;
  /** Stable QR check-in token — URL: /checkin?token={qr_token} */
  qr_token: string;
  photo_url?: string;
  imported_from?: "breeze" | "pco" | "generic" | "manual";
  external_id?: string;
  /** Whether the first SMS (with vCard link) has been sent to this household */
  first_sms_sent?: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// ─── Child ───────────────────────────────────────────────────────────────────
// Firestore: churches/{churchId}/children/{id}

export type ChildGrade =
  | "nursery"
  | "toddler"
  | "pre-k"
  | "kindergarten"
  | "1st"
  | "2nd"
  | "3rd"
  | "4th"
  | "5th"
  | "6th";

export interface Child {
  id: string;
  church_id: string;
  household_id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  date_of_birth?: string;
  grade?: ChildGrade;
  photo_url?: string;
  default_room_id?: string;
  has_alerts: boolean;
  allergies?: string;
  medical_notes?: string;
  /**
   * Wave 9 P0-4: medications split out from `medical_notes` so the
   * HIPAA-aware visibility config can hide it independently. Legacy
   * Child records without this field still work — sub-PR B reads
   * with a `?? null` fallback, and admins can split content during
   * a normal edit.
   */
  medications?: string;
  imported_from?: "breeze" | "pco" | "generic" | "manual";
  external_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── CheckInSession ──────────────────────────────────────────────────────────
// Firestore: churches/{churchId}/checkInSessions/{id}

export interface CheckInSession {
  id: string;
  church_id: string;
  child_id: string;
  household_id: string;
  service_date: string;
  service_id?: string;
  room_id: string;
  room_name: string;
  security_code: string;
  security_code_expires_at: string;
  checked_in_at: string;
  checked_in_by_user_id?: string;
  pre_checked_in: boolean;
  /** Wave 9 P0-5C: nullable so check-in routes can write `null`
   *  explicitly. Firestore `where(field, '==', null)` doesn't match
   *  docs where the field is absent — the explicit-null write makes
   *  the live-count queries work for race detection. */
  checked_out_at?: string | null;
  checked_out_by_user_id?: string;
  alerts_acknowledged: boolean;
  /**
   * Legacy concatenated alert snapshot: `[allergies, medical_notes]
   * .filter(Boolean).join(" | ")`. Kept for back-compat through
   * Wave 9 P0-4; new readers should prefer `medical_snapshot` which
   * preserves per-field structure for the HIPAA-aware visibility gate.
   */
  alert_snapshot?: string;
  /**
   * Wave 9 P0-4: structured medical snapshot captured at check-in.
   * Distinct from `alert_snapshot` (legacy concatenated string) so
   * the kiosk roster + label generator can apply per-field visibility
   * (`CheckInSettings.medical_visibility`) without re-parsing.
   *
   * Fields are nullable independently — a child with only an allergy
   * has `{ allergies: "peanuts", medical_notes: null, medications: null }`.
   * Sessions for children without `has_alerts` skip this field entirely.
   */
  medical_snapshot?: {
    allergies: string | null;
    medical_notes: string | null;
    medications: string | null;
  };
  /**
   * Wave 10 W10-1: per-check-in present pickup contacts. Snapshot
   * of who the operator/parent indicated would be picking up TODAY,
   * captured at check-in time. Used for:
   *   1. SMS fan-out at check-in (each contact + primary guardian
   *      receives the security code; the message body includes the
   *      full recipient list so each person knows who else is
   *      authorized today)
   *   2. SMS fan-out at checkout (same group gets pickup-confirmation
   *      SMS — replaces the responsible-party sticker entirely)
   *   3. Audit trail for "who was authorized for THIS check-in"
   *
   * Persisted denormalized (name + phone) because:
   *   - Source contact records may change between check-in and
   *     checkout (the parent removes a pickup mid-service)
   *   - One-time entries (Grandma flew in for the weekend) aren't
   *     in any authorized list at all
   *
   * `source` tells us where the entry came from at selection time:
   *   - "household_adult" — Person doc with person_type=adult linked
   *     to the household. `ref_id` is the person_id.
   *   - "authorized_pickup" — entry from a child's
   *     ChildProfile.authorized_pickups. `ref_id` is the pickup_id.
   *   - "manual" — typed at the kiosk; not persisted on any list.
   */
  present_recipients?: Array<{
    /** Stable id within this session's recipient set. */
    id: string;
    name: string;
    phone: string | null;
    source: "household_adult" | "authorized_pickup" | "manual";
    ref_id?: string;
  }>;
  created_at: string;
}

// ─── CheckIn Settings ────────────────────────────────────────────────────────
// Firestore: churches/{churchId}/checkinSettings/config (single doc)

export interface CheckInServiceTime {
  id: string;
  name: string;
  day_of_week: number; // 0=Sunday…6=Saturday
  start_time: string; // "09:00" (HH:mm)
  end_time: string; // "10:30"
  is_active: boolean;
}

export type PrinterType = "brother_ql" | "zebra_zd" | "dymo_labelwriter";
export type BrotherLabelSize = "DK-2251" | "DK-1201" | "DK-2205";
export type ZebraLabelSize = "2x1" | "2x2" | "4x1";
export type DymoLabelSize = "30256" | "30321";

/** How the kiosk delivers label data to the printer */
export type PrintMethod = "native_sdk" | "print_server" | "airprint";
/** Physical connection between kiosk device and printer */
export type PrinterConnectionType = "bluetooth" | "wifi";

export interface PrinterConfig {
  id: string;
  station_name: string;
  printer_type: PrinterType;
  ip_address: string;
  port?: number; // default: 9100
  label_size: BrotherLabelSize | ZebraLabelSize | DymoLabelSize;
  /** LAN URL of companion print service (e.g. http://printserver.local:3001) */
  print_server_url?: string;
  is_active: boolean;
  /** How this station prints — defaults to "print_server" for backward compat */
  print_method?: PrintMethod;
  /** For native SDK: bluetooth or wifi */
  connection_type?: PrinterConnectionType;
  /** Bluetooth/MAC address for native SDK Bluetooth printing */
  bluetooth_address?: string;
  /** Printer model name (e.g. "QL-820NWB", "ZD421") */
  printer_model?: string;
}

export interface CheckInSettings {
  service_times: CheckInServiceTime[];
  pre_checkin_window_minutes: number;
  late_arrival_threshold_minutes: number;
  capacity_sms_recipient_phone?: string;
  printers: PrinterConfig[];
  breeze_import_grade_mapping?: Record<string, ChildGrade>;
  /** Send SMS to guardian on check-in with room + security code (Growth+ tier) */
  guardian_sms_on_checkin?: boolean;
  /** Send SMS to guardian on checkout confirmation (Growth+ tier) */
  guardian_sms_on_checkout?: boolean;
  /**
   * Wave 9 P0-4: per-field medical-data visibility, applied at the
   * three surfaces where alerts surface (printed child label, kiosk
   * room roster, admin reports). Lets churches dial in their HIPAA
   * posture without affecting the underlying medical data itself.
   *
   * Semantics per field:
   *   - `label`: include this field on the printed child label
   *   - `roster`: include this field on the kiosk room-roster view
   *   - `expand_on_tap_only`: when true on the roster, the field is
   *     hidden until an operator explicitly taps to expand (firing
   *     the existing `kiosk.medical_data_revealed` audit). Ignored
   *     when `roster` is false.
   *
   * Sub-PR B applies these gates in the label generator + roster
   * renderer. Sub-PR C surfaces the toggles in Settings.
   *
   * Default (when the field is undefined on the settings doc): every
   * field is rendered everywhere, no tap-to-expand — matches today's
   * behavior. Churches choosing a stricter posture override.
   */
  medical_visibility?: {
    allergies: {
      label: boolean;
      roster: boolean;
      expand_on_tap_only: boolean;
    };
    medical_notes: {
      label: boolean;
      roster: boolean;
      expand_on_tap_only: boolean;
    };
    medications: {
      label: boolean;
      roster: boolean;
      expand_on_tap_only: boolean;
    };
  };
  /**
   * Wave 9 P0-5: percent (0–100) of room ratio capacity at which the
   * kiosk shows a warning banner. The hard violation (block + require
   * staffed-station override) fires at 100%. Default 90 — admins can
   * tighten to 75 for stricter, or 100 to disable warnings entirely
   * (only blocks at violation). Applies across all rooms with
   * `ratio_policy.enabled === true`.
   */
  ratio_warning_threshold_percent?: number;
  /**
   * Wave 9 P0-2: Emergency Response Team. When a blocked-pickup attempt is
   * detected at the kiosk, SMS is sent to the owner AND every number in
   * this list in parallel. Owner retains sole override authority — operators
   * on-site cannot self-override regardless of who responds first.
   *
   * Stored on the admin-only `checkinSettings` doc (see firestore.rules).
   * Empty / undefined → ERT fan-out skipped, owner-only notification.
   */
  emergency_notification_numbers?: {
    /** Human label for the recipient (e.g. "Deacon Joe Smith"). */
    name: string;
    /** E.164-formatted phone (Twilio requirement). */
    phone: string;
    /** Optional role tag for filtering/display (e.g. "Safety Team Lead"). */
    role: string | null;
  }[];
  updated_by: string;
  updated_at: string;
}

// ─── CheckIn Alerts ──────────────────────────────────────────────────────────
// Firestore: churches/{churchId}/checkinAlerts/{id}

export interface CheckInAlert {
  id: string;
  church_id: string;
  session_id: string;
  child_id: string;
  alert_type: "wrong_code" | "expired_code" | "capacity_exceeded";
  attempted_code?: string;
  occurred_at: string;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
}

// ─── Label Printing ──────────────────────────────────────────────────────────

export interface LabelJob {
  type: "child_label" | "parent_stub";
  child_name?: string;
  child_names?: string[];
  room_name?: string;
  service_date: string;
  security_code: string;
  church_name: string;
  has_allergy_alert: boolean;
  allergy_text?: string;
}

export interface LabelPayload {
  format: "png" | "zpl" | "dymo_xml";
  /** Base64-encoded PNG or raw ZPL/XML text */
  data: string;
  printer_id: string;
}

// ─── Room (shared with Part 2: Room/Resource Scheduling) ─────────────────────
// Firestore: churches/{churchId}/rooms/{id}

export interface Room {
  id: string;
  church_id: string;
  name: string;
  description?: string;
  capacity?: number;
  location?: string;
  campus_id?: string;
  equipment: string[];
  photo_url?: string;
  suggested_ministry_ids: string[];
  is_active: boolean;
  display_public: boolean;
  public_visible: boolean;
  calendar_token: string;
  /** Per-room approval override. When true, any reservation against this
   *  room is created as `pending_approval` regardless of the org-wide
   *  `RoomSettings.require_approval`. Falsy/undefined → fall back to the
   *  org-wide setting. */
  requires_approval?: boolean;
  // Check-in specific fields
  default_grades?: ChildGrade[];
  overflow_room_id?: string;
  checkin_view_token?: string;
  /**
   * Wave 9 P0-5: per-room volunteer-to-child ratio policy. Enforced
   * by the kiosk check-in route (sub-PR C) — over-ratio check-ins
   * are blocked at violation and warned at threshold. ECAP Indicator
   * 3.12 (two-deep leadership) is encoded as `min_unrelated_adults`.
   *
   * Defaults when undefined: no ratio enforcement — matches today's
   * behavior. Existing rooms are unaffected until an admin opts in.
   *
   * Field meanings:
   *   - enabled: master switch. When false, the rest of the fields
   *     are advisory display-only and the check-in gate is skipped.
   *   - min_volunteers: absolute floor (>=) before any child can be
   *     checked in. Two-deep policy typically sets this to 2.
   *   - max_children_per_volunteer: numerator of the ratio
   *     (children / max_children_per_volunteer = max volunteers
   *     required). Common values: 4 (nursery), 6 (preschool), 8
   *     (elementary), 10 (middle/high). The check-in gate uses:
   *     `children + 1 > volunteers * max_children_per_volunteer`.
   *   - min_unrelated_adults: floor for "non-related" adults in the
   *     room. Counts a volunteer as unrelated to another only when
   *     their household_ids don't intersect — so a parent serving
   *     in the same room as their child counts as ONE adult but
   *     does NOT satisfy two-deep. The scheduler-side enforcement
   *     of this is via the parent-child related_to computation on
   *     RoomVolunteerCheckIn.
   *   - max_children: optional hard cap (>=) in addition to ratio.
   *     Distinct from `capacity` — capacity is the room's physical
   *     limit; max_children is the policy ceiling regardless of
   *     volunteers.
   */
  ratio_policy?: {
    enabled: boolean;
    min_volunteers: number;
    max_children_per_volunteer: number;
    min_unrelated_adults: number;
    max_children?: number;
  };
  /** Links this room to a facility group for cross-org visibility */
  facility_group_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Wave 9 P0-5: a volunteer's check-in to a specific room for a
 * specific service-date. Distinct from `CheckInSession` which
 * tracks CHILDREN; this tracks the adults who are responsible for
 * them. Persisted at
 * `churches/{churchId}/roomVolunteerCheckins/{id}` (note the
 * camelCase collection name to match the existing
 * `checkInSessions` convention).
 *
 * `related_to` is computed at check-in time from
 * `UnifiedHousehold.member_ids` — it lists every OTHER person in
 * the same room whose household intersects this volunteer's. Used
 * by the two-deep gate to determine whether a volunteer counts as
 * an "unrelated adult."
 */
export interface RoomVolunteerCheckIn {
  id: string;
  church_id: string;
  room_id: string;
  person_id: string;
  /** ISO date "YYYY-MM-DD" — matches CheckInSession.service_date. */
  service_date: string;
  checked_in_at: string;
  /** Null until the volunteer is checked out (or the day ends). */
  checked_out_at?: string | null;
  /**
   * Person IDs of OTHER volunteers in the same room whose households
   * overlap this volunteer's at check-in time. Snapshot — re-computed
   * if the volunteer rejoins after a checkout. Used by
   * `evaluateRatio()` to count unrelated adults.
   */
  related_to: string[];
  /**
   * Who initiated the check-in. Useful for audit + parent-self-checkin
   * vs. operator-tap differentiation:
   *   - "self"        — volunteer scanned own QR / opened own page
   *   - "operator"    — kiosk operator tapped name on roster
   *   - "system"      — auto-checked-in via schedule (future)
   */
  source: "self" | "operator" | "system";
  /** UID of the person who recorded the check-in (operator or self). */
  recorded_by_user_id: string | null;
}

// ─── Shared Facility Groups ──────────────────────────────────────────────────

export interface FacilityGroup {
  id: string;
  name: string;
  created_by_church_id: string;
  created_at: string;
}

export type FacilityGroupMemberStatus = "pending" | "active";

export interface FacilityGroupMember {
  id: string;
  church_id: string;
  church_name: string;
  status: FacilityGroupMemberStatus;
  invited_by_church_id: string;
  joined_at: string | null;
}

// ─── Room & Resource Scheduling (Part 2) ─────────────────────────────────────

export type ReservationStatus =
  | "confirmed"
  | "pending_approval"
  | "denied"
  | "cancelled";

export type RecurrenceFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly_by_date"
  | "monthly_by_weekday";

export type RecurrenceEndType = "never" | "until_date" | "count";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  days_of_week?: number[]; // 0=Sunday…6=Saturday
  monthly_week?: number; // 1-5 (for monthly_by_weekday: "2nd Sunday")
  monthly_weekday?: number; // 0-6 (for monthly_by_weekday)
  end_type: RecurrenceEndType;
  end_date?: string; // ISO date (for until_date)
  count?: number; // number of occurrences (for count)
}

// Firestore: churches/{churchId}/reservations/{id}
export interface Reservation {
  id: string;
  church_id: string;
  room_id: string;
  title: string;
  description?: string;
  ministry_id?: string;
  requested_by: string; // user_id
  requested_by_name: string;
  date: string; // ISO date "YYYY-MM-DD"
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  status: ReservationStatus;
  // Equipment & teams
  equipment_requested: string[];
  teams_needed: string[]; // ministry IDs
  attendee_count?: number;
  setup_notes?: string;
  // Recurrence
  is_recurring: boolean;
  recurrence_rule?: RecurrenceRule;
  recurrence_group_id?: string; // shared across all occurrences
  recurrence_index?: number; // 0-based occurrence number
  // Conflict tracking
  conflict_with_ids: string[];
  // Approval
  approved_by?: string;
  approved_at?: string;
  denied_by?: string;
  denied_at?: string;
  denied_reason?: string;
  created_at: string;
  updated_at: string;
}

// Firestore: churches/{churchId}/reservation_requests/{id}
export interface ReservationRequest {
  id: string;
  church_id: string;
  new_reservation_id: string;
  /** Reason the request landed in the queue. "conflict" = overlapping
   *  existing reservation; "approval_required" = the room or org requires
   *  admin approval for every booking. */
  reason?: "conflict" | "approval_required";
  /** Populated only when the source booking was recurring. Approve/deny
   *  applies to the whole group, not just `new_reservation_id`. */
  recurrence_group_id?: string;
  conflicting_reservation_ids: string[];
  status: "pending" | "approved" | "denied";
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  notified_at?: string;
  created_at: string;
}

// Firestore: churches/{churchId}/roomSettings/config (singleton)
export interface RoomSettings {
  equipment_tags: string[];
  require_approval: boolean;
  max_advance_days: number;
  default_setup_minutes: number;
  default_teardown_minutes: number;
  public_calendar_enabled: boolean;
  public_calendar_token: string;
  conflict_notification_user_ids: string[];
  updated_by: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Unified Person Model (Phase 0 — Foundation)
// ---------------------------------------------------------------------------
// Replaces the separate Volunteer, CheckInHousehold, and Child entities with
// a single Person document per individual. Children are Person documents with
// person_type: "child". Scheduling fields are inline for single-query perf.

// ─── Permission System ─────────────────────────────────────────────────────

export type PermissionFlag = "event_coordinator" | "facility_coordinator" | "checkin_volunteer";

// ─── Background Check Integration ─────────────────────────────────────────

export type BackgroundCheckStatus = "cleared" | "pending" | "failed" | "expired" | "not_required";

/**
 * Interface for pluggable background check providers.
 * Implement this for Protect My Ministry, Checkr, Sterling, etc.
 */
export interface BackgroundCheckProvider {
  /** Provider display name (e.g. "Protect My Ministry") */
  name: string;
  /** Initiate a background check for a person */
  initiateCheck(person: { id: string; name: string; email: string }): Promise<{
    checkId: string;
    status: "pending";
  }>;
  /** Poll for status update on an existing check */
  getStatus(checkId: string): Promise<{
    status: BackgroundCheckStatus;
    expiresAt?: string;
    details?: string;
  }>;
  /** Optional: generate a link for the candidate to complete their check */
  getCandidateUrl?(checkId: string): Promise<string | null>;
}

// ─── Person Types ──────────────────────────────────────────────────────────

export type PersonType = "adult" | "child";
export type PersonStatus = "active" | "inactive" | "archived";

/** Scheduling-specific data embedded on a Person document (volunteers only). */
export interface SchedulingProfile {
  skills: string[];
  max_services_per_month: number;
  /** ISO date strings; supports date ranges like "2026-04-01/2026-04-07" */
  blockout_dates: string[];
  /** Day names: "sunday", "monday", etc. */
  recurring_unavailable: string[];
  preferred_frequency: number;
  /** Carried from existing VolunteerAvailability */
  max_roles_per_month: number;
  /** Week-of-month preferences: [1, 3] = prefers 1st and 3rd weeks */
  preferred_weeks?: number[];
  /**
   * Free-text note from the volunteer for schedulers (e.g. "prefer morning
   * services", "needs childcare"). Optional. Visible in the schedule matrix
   * person-picker. Codex QA 2026-05-15: added per tester wishlist.
   */
  notes?: string;
}

/** Child-specific data embedded on a Person document (children only). */
export interface ChildProfile {
  date_of_birth: string | null;
  grade: ChildGrade | null;
  allergies: string | null;
  medical_notes: string | null;
  default_room_id: string | null;
  has_alerts: boolean;
  authorized_pickups: PersonAuthorizedPickup[];
  photo_url: string | null;
  /**
   * Wave 9 P0-4: medications split from `medical_notes` so the
   * HIPAA-aware visibility config can hide it independently. null
   * (rather than missing) for explicit "no medications recorded";
   * legacy ChildProfile records without this field treat it as null
   * via `?? null` in readers.
   */
  medications?: string | null;
}

/**
 * An authorized pickup contact for a child.
 *
 * Wave 9 P0-2 added `id` / `photo_url` / `added_at` / `added_by_user_id` to
 * support visual ID at pickup and an audit trail of who added each contact.
 * All four new fields are optional so legacy records that pre-date P0-2
 * remain valid; API routes backfill the missing fields the next time the
 * household is edited.
 */
export interface PersonAuthorizedPickup {
  /** Stable identifier for edit/delete. Backfilled by the API on first
   *  write after P0-2; required on all new records. */
  id?: string;
  name: string;
  phone: string | null;
  relationship: string | null;
  /**
   * Optional photo for visual identification at pickup. Stored at
   * `churches/{churchId}/checkin-photos/authorized/{id}.jpg`. Reads go
   * through a server endpoint (Admin SDK + signed URL); no direct client
   * Storage reads — see `storage.rules`.
   */
  photo_url?: string | null;
  /** ISO timestamp; optional on legacy records. */
  added_at?: string;
  /** Firebase Auth UID of the admin who added this contact; optional on
   *  legacy records. */
  added_by_user_id?: string;
  /**
   * Wave 9 P0-2 sub-PR G: parent self-service pickup-list cooling-off.
   * When set to a future ISO timestamp, the entry stays visible in
   * admin / parent UI WITH a "pending removal" badge but is filtered
   * out of reads once the timestamp is reached. Cooling-off applies
   * only to PARENT-initiated removals; admin removals via the existing
   * admin endpoints are still immediate (the destructive path is the
   * one that needs the 24h window).
   * - undefined / null → no pending removal
   * - future timestamp → pending removal at that time
   * - past timestamp   → effectively removed (filtered from reads)
   *
   * Sub-PR G v2 will add a cleanup cron to physically prune past
   * pending-removal entries; for now they remain in the array but
   * are filtered at read time.
   */
  pending_remove_at?: string | null;
  /** UID of the guardian who requested the removal. Audit aid.
   *  Nullable because cancel-removal clears it alongside
   *  pending_remove_at — Firestore rejects `undefined` in nested
   *  arrays, so we write `null` rather than deleting the key. */
  pending_remove_by_user_id?: string | null;
}

/**
 * A blocked pickup contact — a person who is NOT permitted to take the
 * child / sibling group home.
 *
 * Stored as a top-level subcollection at
 * `churches/{churchId}/checkin_blocked_pickups/{id}` rather than embedded
 * on `ChildProfile` so the most sensitive surface in the system (custody
 * disputes, court orders) lives behind an Admin-SDK-only privacy boundary
 * — distinct from `people/{personId}` which is volunteer-readable. The
 * scope discriminator lets a single block-list query cover both per-child
 * blocks and household-wide custody orders that apply to all siblings.
 */
export interface BlockedPickup {
  id: string;
  church_id: string;
  /** "child" → applies to a single child only. "household" → applies to
   *  every child in the household (sibling-wide custody order). */
  scope: "child" | "household";
  /** Required when `scope === "child"`; null otherwise. */
  child_id: string | null;
  /** Required when `scope === "household"`; null otherwise. */
  household_id: string | null;
  name: string;
  phone: string | null;
  /** Photo for visual identification at the kiosk's staffed-checkout
   *  confirmation step. Stored at
   *  `churches/{churchId}/checkin-photos/blocked/{id}.jpg`. */
  photo_url: string | null;
  reason: "court_order" | "household_decision" | "other";
  /** Free-form admin notes. DO NOT paste court-order quotations here —
   *  store the URL of the uploaded order in `document_url` instead. */
  notes: string | null;
  /** Storage URL of the supporting document (e.g. PDF of custody order). */
  document_url: string | null;
  /** Optional ISO expiry. Used for time-limited orders ("until 2026-12-01"). */
  expires_at: string | null;
  added_at: string;
  added_by_user_id: string;
}

/**
 * Wave 9 P0-3: a single hard restriction on a volunteer.
 *
 * Stored as an array on `Person.restrictions` (append-only history). A
 * restriction is "active" when `lifted_at === null`. The scheduler's
 * `hasNoChildrenRestriction()` gate denies any assignment in a
 * children-category ministry when an active restriction with
 * `cannot_serve_with_children === true` exists.
 *
 * `reason` enum keeps the schema tight for compliance reporting:
 *   - "sor_match"            → the volunteer matched a sex-offender
 *                              registry entry (ECAP Indicator 3.15)
 *   - "policy"               → org-level policy decision unrelated to SOR
 *   - "other"                → free-form (paired with `notes`)
 *
 * Only owners can add or lift restrictions (server-side gate at the
 * /api/people/[id]/restrictions endpoints — Sub-PR B).
 */
export interface PersonRestriction {
  id: string;
  cannot_serve_with_children: boolean;
  reason: "sor_match" | "policy" | "other";
  /** Free-form admin notes. Avoid storing PII details (e.g., specific
   *  offense codes) — reference an external document URL instead if needed. */
  notes?: string | null;
  documented_by_user_id: string;
  documented_at: string;
  /** When set, the restriction is no longer active. Append-only —
   *  rather than deleting a row, owners "lift" it by setting this field. */
  lifted_at?: string | null;
  lifted_by_user_id?: string | null;
}

/**
 * Unified Person document — replaces Volunteer, CheckInHousehold guardian,
 * and Child as separate entities.
 * Firestore: churches/{churchId}/people/{personId}
 */
export interface Person {
  id: string;
  church_id: string;
  /** Array for blended family support — a child can belong to multiple households */
  household_ids: string[];
  person_type: PersonType;

  first_name: string;
  last_name: string;
  preferred_name: string | null;
  /** Denormalized "First Last" for display */
  name: string;
  /** Lowercase for Firestore prefix queries */
  search_name: string;

  email: string | null;
  phone: string | null;
  /** Digits-only phone variants for kiosk lookup via array-contains */
  search_phones: string[];
  photo_url: string | null;
  status: PersonStatus;

  // Auth linkage
  /** Firebase Auth UID — null for non-logged-in people */
  user_id: string | null;
  /** Link to the Membership doc for logged-in members */
  membership_id: string | null;

  // Volunteer capability flags (top-level for Firestore querying)
  is_volunteer: boolean;
  ministry_ids: string[];
  role_ids: string[];
  campus_ids: string[];

  // Embedded profiles
  scheduling_profile: SchedulingProfile | null;
  child_profile: ChildProfile | null;

  // Volunteer stats (inline for dashboard queries)
  stats: VolunteerStats | null;

  // Existing fields carried forward from Volunteer
  imported_from: ImportSource | null;
  background_check: {
    status: "cleared" | "pending" | "expired" | "not_required";
    expires_at: string | null;
    provider: string | null;
    checked_at: string | null;
    /**
     * Wave 9 P0-3: explicit Sex Offender Registry check.
     * Distinct from generic background_check so admins can require it
     * even when the general bg-check is pending or not_required.
     *
     * - `sor_checked`: was an SOR check performed in the lifecycle?
     *   (Implicit from last_sor_check_at !== null; kept explicit for
     *   audit-trail readability.)
     * - `sor_match`: result of the most recent SOR check. null = no check
     *   has run; true = the volunteer matched a registry entry; false =
     *   cleared (no match).
     * - `last_sor_check_at`: ISO timestamp of the most recent SOR check.
     */
    sor_checked?: boolean;
    sor_match?: boolean | null;
    last_sor_check_at?: string | null;
    /**
     * Wave 9 P0-3 sub-PR D: idempotency cache for the raw bg-check
     * expiry-warning cron. Stores the `expires_at` value the most
     * recent warning was sent against. If admin updates `expires_at`
     * (e.g. after a renewal), this value won't match, so the next
     * cron pass re-sends a warning at the appropriate threshold.
     * The cron writes both fields atomically when a warning ships.
     */
    expiry_warning_sent_for?: string | null;
    expiry_warning_sent_at?: string | null;
  } | null;
  /**
   * Wave 9 P0-3: per-volunteer hard restrictions. Append-only history;
   * a restriction is "lifted" by setting `lifted_at` rather than deleting
   * the row (legal artifact + audit trail). The scheduler's
   * `hasNoChildrenRestriction()` gate denies assignments to ministries
   * with `category === "children_youth"` when ANY active restriction
   * (lifted_at === null) has `cannot_serve_with_children === true`.
   *
   * Designed around ECAP Indicator 3.15 (sex-offender categorical
   * exclusion from children's ministry) but the schema accommodates
   * any "this volunteer is barred from children's roles" policy.
   */
  restrictions?: PersonRestriction[];
  role_constraints: {
    conditional_roles: ConditionalRole[];
    allow_multi_role: boolean;
  } | null;
  volunteer_journey: VolunteerJourneyStep[] | null;

  /** Stable QR token for check-in families */
  qr_token: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Unified Household ─────────────────────────────────────────────────────
// Firestore: churches/{churchId}/households/{householdId}
// Replaces the separate scheduling Household and CheckInHousehold entities.

export interface UnifiedHousehold {
  id: string;
  church_id: string;
  /** Display name, e.g. "The Smith Family" */
  name: string;
  /** Person ID of the primary contact (for notifications, check-in display) */
  primary_guardian_id: string | null;
  /** Stable QR token for fast check-in */
  qr_token: string | null;

  constraints: {
    never_same_service: boolean;
    prefer_same_service: boolean;
    /** Hard constraint: no household members assigned to any service on the same date */
    never_same_time: boolean;
  };

  notes: string | null;
  imported_from: "breeze" | "pco" | "generic" | "manual" | null;
  created_at: string;
  updated_at: string;
}

// ─── Feature Flags ─────────────────────────────────────────────────────────
// Added to Church document. Derived from subscription_tier but decoupled
// to allow manual overrides (beta testers, founding church discounts).

export interface FeatureFlags {
  checkin_enabled: boolean;
  rooms_enabled: boolean;
  stage_sync_enabled: boolean;
  service_planning_enabled: boolean;
  /** -1 = unlimited */
  max_volunteers: number;
  /** -1 = unlimited */
  max_teams: number;
  retention_dashboard: boolean;
  background_checks: boolean;
  calendar_feeds: boolean;
  custom_notifications: boolean;
}

// ---------------------------------------------------------------------------
// Feedback System
// ---------------------------------------------------------------------------

export type FeedbackCategory = "bug" | "pain_point" | "feature_request" | "idea" | "question";

export type FeedbackPriority = "critical" | "high" | "medium" | "low" | "unset";

export type FeedbackStatus =
  | "submitted"
  | "acknowledged"
  | "triaged"
  | "in_progress"
  | "resolved"
  | "wont_do"
  | "duplicate";

export type FeedbackDisposition =
  | "ignore"
  | "exclude"
  | "consider"
  | "planned"
  | "shipped";

export interface FeedbackItem {
  id: string;
  church_id: string;
  // Submitter
  submitted_by_user_id: string;
  submitted_by_name: string;
  submitted_by_email: string;
  submitted_by_role: OrgRole;
  // Content
  category: FeedbackCategory;
  title: string;
  description: string;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  screenshot_urls: string[];
  // Auto-captured context
  page_url: string;
  user_agent: string;
  app_version: string | null;
  // Admin triage
  priority: FeedbackPriority;
  status: FeedbackStatus;
  disposition: FeedbackDisposition | null;
  assigned_to: string | null;
  tags: string[];
  // Resolution
  resolution_notes: string | null;
  related_feedback_ids: string[];
  duplicate_of_id: string | null;
  // Timestamps
  acknowledged_at: string | null;
  triaged_at: string | null;
  resolved_at: string | null;
  // Submitter-visible response
  admin_response: string | null;
  admin_response_at: string | null;
  /** Admin-only internal notes (not visible to submitter) */
  internal_notes: string | null;
  // Metadata
  created_at: string;
  updated_at: string;
  /** True if submitted via Sunday Incident mode */
  is_sunday_incident?: boolean;
  /** True if a copy was forwarded to the platform team (bugs & feature requests) */
  platform_feedback?: boolean;
  // Platform escalation
  escalated_to_platform?: boolean;
  escalated_at?: string | null;
  escalated_by?: string | null;
  // Platform admin triage
  platform_status?: "pending" | "reviewing" | "planned" | "shipped" | "wont_fix" | null;
  platform_response?: string | null;
  platform_response_at?: string | null;
  platform_response_by?: string | null;
  platform_internal_notes?: string | null;
  platform_priority?: FeedbackPriority | null;
  platform_tags?: string[];
}

export type FeedbackActivityType =
  | "status_change"
  | "priority_change"
  | "category_change"
  | "disposition_change"
  | "comment"
  | "admin_response"
  | "assignment_change"
  | "tag_change"
  | "duplicate_linked"
  | "escalated_to_platform"
  | "platform_status_change"
  | "platform_response"
  | "platform_priority_change";

export interface FeedbackActivity {
  id: string;
  feedback_id: string;
  type: FeedbackActivityType;
  actor_user_id: string;
  actor_name: string;
  previous_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

// --- Platform Stats ---

export interface PlatformStats {
  total_orgs: number;
  new_orgs_30d: number;
  new_orgs_60d: number;
  new_orgs_90d: number;
  tier_distribution: Record<SubscriptionTier, number>;
  total_people: number;
  total_volunteers: number;
  new_people_30d: number;
  new_people_60d: number;
  new_people_90d: number;
  total_assignments: number;
  total_feedback: number;
  open_platform_feedback: number;
  feature_adoption: {
    worship_enabled: number;
    checkin_enabled: number;
    rooms_enabled: number;
  };
  /**
   * Wave 0 (2026-05-25): marketing-friendly rollups summed from the
   * per-org snapshots in `platform_orgs/*`. Available for hero copy
   * on the landing page (e.g. "X organizations · Y volunteers ·
   * Z assignments scheduled this month") and for the platform admin
   * overview's "Platform totals" panel.
   *
   * All fields default to 0 if the per-org snapshot pass hasn't
   * happened yet — safe to render even before the first cron run.
   */
  marketing?: {
    /** Orgs with `status === "active"` after the nightly snapshot pass. */
    total_active_orgs: number;
    /** Sum of `memberships.volunteer + memberships.total_active` across orgs (active members minus pending). */
    total_volunteers_all_orgs: number;
    /** Sum of `counts.services` across orgs. */
    total_services_all_orgs: number;
    /** Sum of `recent_activity.assignments_by_day` (length 30) across orgs. */
    scheduled_assignments_30d: number;
    /** Orgs with any event_signup activity in the past 30 days. */
    events_with_signups_30d: number;
  };
  computed_at: string;
}

// --- Kiosk Stations & Tokens (Track B) ---
// Firestore: top-level collections, Admin-SDK only (no client access).
// All three live at the platform level so the same kiosk concepts could
// later support orgs sharing kiosks at a shared facility.

export type KioskScope =
  | "lookup"
  | "checkin"
  | "checkout"
  | "register"
  | "print"
  | "services"
  | "room";

export type KioskStationStatus = "active" | "revoked";

/**
 * Determines the kiosk token's allowed scopes at activation time.
 *
 *   self_service — unattended kiosk in the lobby. Excludes "checkout" — release
 *                  always happens at a staffed station, matching the PCO /
 *                  KidCheck industry pattern. This is the new default.
 *   staffed       — manned kiosk operated by a check-in volunteer. Full scope
 *                   including "checkout" (single station handles release).
 *
 * `roster_display` is reserved for a future read-only signage station (P1-10).
 *
 * Legacy stations created before this field existed default to "staffed" at
 * read time so existing churches see no behavior change.
 */
export type KioskStationType = "self_service" | "staffed";

/** A registered kiosk device. Doc ID = stable station_id. */
export interface KioskStation {
  id: string;
  church_id: string;
  /** Operator-friendly label, e.g. "Lobby Kiosk" or "Children's Wing iPad". */
  name: string;
  /** Drives the token scope at activation (and re-activation after type change). */
  type: KioskStationType;
  status: KioskStationStatus;
  created_at: string;
  created_by_uid: string;
  revoked_at?: string | null;
  revoked_by_uid?: string | null;
  last_used_at?: string | null;
  /** Active token doc id; null if station has never been activated or has been revoked. */
  active_token_id?: string | null;
}

/**
 * One-time activation code. Doc ID = the code itself (uppercase 8-char hex).
 * Operator types this on the kiosk to enroll the device. TTL ~10 minutes.
 */
export interface KioskActivation {
  /** Doc ID — the human-typed activation code. */
  code: string;
  station_id: string;
  church_id: string;
  /** ISO timestamp; reject if past. */
  expires_at: string;
  /** Set when the kiosk POSTs to /api/kiosk/activate; ensures one-time use. */
  consumed_at?: string | null;
  /** Optional device fingerprint captured at activation, for visibility. */
  consumed_by_device?: string | null;
  created_at: string;
  created_by_uid: string;
}

/**
 * Long-lived kiosk credential. Doc ID = the public token_id. Secret half is
 * NOT stored — only its SHA-256 hash. The full credential the kiosk presents
 * is `${id}.${secret}` in the X-Kiosk-Token header.
 */
export interface KioskToken {
  /** Doc ID — public part of the credential. */
  id: string;
  /** SHA-256 of the secret half, hex-encoded. */
  token_hash: string;
  station_id: string;
  church_id: string;
  scope: KioskScope[];
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  /** Null for non-expiring tokens (kiosks usually want long-lived). */
  expires_at?: string | null;
  device_fingerprint?: string | null;
}
