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
  /** Scheduler/admin notification preferences. Only relevant for scheduler+ roles. */
  scheduler_notification_preferences?: SchedulerNotificationPreferences;
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

export interface Church {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  workflow_mode: WorkflowMode;
  timezone: string;
  subscription_tier: SubscriptionTier;
  /** How the tier was set — absent defaults to "stripe" */
  subscription_source?: SubscriptionSource;
  stripe_customer_id: string | null;
  settings: ChurchSettings;
  /** Org-wide prerequisites that apply to ALL teams */
  org_prerequisites?: OnboardingStep[];
  /** CCLI Church Copyright License number */
  ccli_number: string | null;
  /** ISO timestamp when the CCLI attestation checkbox was accepted */
  ccli_attestation_at: string | null;
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
  | "custom";            // admin-defined freeform requirement

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

export type VolunteerStatus = "active" | "inactive" | "pending" | "archived";

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
  | "custom";

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

