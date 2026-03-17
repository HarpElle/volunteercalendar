/* VolunteerCalendar — Core Type Definitions */

// --- Auth & Users ---

export type UserRole = "admin" | "team_lead" | "volunteer";

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  church_id: string;
  role: UserRole;
  ministry_ids: string[];
  created_at: string;
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

export interface Church {
  id: string;
  name: string;
  slug: string;
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

// --- Ministries ---

export interface Ministry {
  id: string;
  church_id: string;
  name: string;
  color: string;
  description: string;
  lead_user_id: string;
  lead_email: string;
  created_at: string;
}

// --- Services ---

export type RecurrencePattern = "weekly" | "biweekly" | "monthly" | "custom";

export interface ServiceRole {
  role_id: string;
  title: string;
  count: number;
}

export interface Service {
  id: string;
  church_id: string;
  ministry_id: string;
  name: string;
  recurrence: RecurrencePattern;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  roles: ServiceRole[];
  created_at: string;
}

// --- Volunteers ---

export type ReminderChannel = "email" | "sms" | "calendar" | "none";
export type ImportSource =
  | "csv"
  | "planning_center"
  | "breeze"
  | "rock"
  | "manual";

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

export interface Volunteer {
  id: string;
  church_id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  ministry_ids: string[];
  role_ids: string[];
  household_id: string | null;
  availability: VolunteerAvailability;
  reminder_preferences: {
    channels: ReminderChannel[];
  };
  stats: VolunteerStats;
  imported_from: ImportSource;
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
}

// --- Assignments ---

export type AssignmentStatus =
  | "draft"
  | "confirmed"
  | "declined"
  | "no_show"
  | "substitute_requested";

export interface Assignment {
  id: string;
  schedule_id: string;
  church_id: string;
  service_id: string;
  service_date: string;
  volunteer_id: string;
  role_id: string;
  role_title: string;
  ministry_id: string;
  status: AssignmentStatus;
  confirmation_token: string;
  responded_at: string | null;
  reminder_sent_at: string[];
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

/** A service occurrence on a specific date */
export interface ServiceOccurrence {
  service: Service;
  date: string;
}
