import type { WorkflowMode, SubscriptionTier, ReminderChannel } from "@/lib/types";

/** Tier limits for gating */
export const TIER_LIMITS: Record<string, {
  volunteers: number;
  ministries: number;
  short_links: number;
  roles_per_service: number;
  active_events: number;
  roles_per_event: number;
  worship_enabled: boolean;
  workflow_modes_all: boolean;
  multi_stage_approval: boolean;
  ccli_auto_reporting: boolean;
}> = {
  free:       { volunteers: 20,       ministries: 2,        short_links: 0,   roles_per_service: 3,  active_events: 1,        roles_per_event: 2,  worship_enabled: false, workflow_modes_all: false, multi_stage_approval: false, ccli_auto_reporting: false },
  starter:    { volunteers: 100,      ministries: 5,        short_links: 3,   roles_per_service: 8,  active_events: 5,        roles_per_event: 5,  worship_enabled: false, workflow_modes_all: true,  multi_stage_approval: false, ccli_auto_reporting: false },
  growth:     { volunteers: 250,      ministries: 15,       short_links: 10,  roles_per_service: 20, active_events: 15,       roles_per_event: 15, worship_enabled: true,  workflow_modes_all: true,  multi_stage_approval: true,  ccli_auto_reporting: false },
  pro:        { volunteers: 500,      ministries: Infinity,  short_links: 25,  roles_per_service: 50, active_events: Infinity,  roles_per_event: 50, worship_enabled: true,  workflow_modes_all: true,  multi_stage_approval: true,  ccli_auto_reporting: true  },
  enterprise: { volunteers: Infinity, ministries: Infinity,  short_links: 100, roles_per_service: Infinity, active_events: Infinity, roles_per_event: Infinity, worship_enabled: true, workflow_modes_all: true, multi_stage_approval: true, ccli_auto_reporting: true },
};

export const WORKFLOW_MODES: { value: WorkflowMode; label: string; description: string }[] = [
  {
    value: "centralized",
    label: "Centralized",
    description: "Admin drafts full schedule. Team leads review and approve. Admin publishes globally.",
  },
  {
    value: "ministry-first",
    label: "Team-First",
    description: "Each team lead generates and publishes independently. Admin monitors conflicts.",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Auto-draft creates templates. Leaders tweak independently. Admin sees cross-team alerts.",
  },
  {
    value: "self-service",
    label: "Self-Service",
    description: "Volunteers self-signup for open slots. No approval workflow.",
  },
];

export const REMINDER_CHANNELS: { value: ReminderChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "calendar", label: "Calendar Invite" },
  { value: "none", label: "None" },
];

// --- Scheduler Notification Defaults ---

import type { SchedulerNotificationPreferences, SchedulerNotificationType } from "@/lib/types";

export const SCHEDULER_NOTIFICATION_TYPES: {
  value: SchedulerNotificationType;
  label: string;
  description: string;
  urgency: "standard" | "urgent";
}[] = [
  { value: "assignment_change", label: "Assignment Changes", description: "When a volunteer confirms, declines, or is reassigned", urgency: "standard" },
  { value: "absence_alert", label: "Absence Alerts", description: "When a volunteer notifies they can't make it", urgency: "urgent" },
  { value: "swap_request", label: "Swap Requests", description: "When a swap is requested or needs approval", urgency: "urgent" },
  { value: "self_removal", label: "Self-Removals", description: "When a volunteer removes themselves from a role", urgency: "urgent" },
  { value: "schedule_published", label: "Schedule Published", description: "When a new schedule is published", urgency: "standard" },
];

export const DEFAULT_SCHEDULER_NOTIFICATION_PREFS: SchedulerNotificationPreferences = {
  enabled_types: ["assignment_change", "absence_alert", "swap_request", "self_removal"],
  channels: {
    standard: ["email"],
    urgent: ["email"],
  },
  ministry_scope: [],
};

export const PRICING_TIERS: {
  tier: SubscriptionTier;
  name: string;
  price: string;
  volunteers: string;
  ministries: string;
  features: string[];
  highlighted?: boolean;
}[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    volunteers: "20",
    ministries: "2",
    features: [
      "Up to 20 volunteers",
      "2 teams",
      "3 roles per service",
      "1 active event",
      "Email reminders",
      "iCal calendar feeds",
      "Household scheduling",
    ],
  },
  {
    tier: "starter",
    name: "Starter",
    price: "$29/mo",
    volunteers: "100",
    ministries: "5",
    features: [
      "100 volunteers",
      "5 teams",
      "All scheduling workflow modes",
      "Availability campaigns",
      "SMS + email reminders",
      "Smart check-in (QR, time & proximity)",
      "Shift swap",
    ],
  },
  {
    tier: "growth",
    name: "Growth",
    price: "$69/mo",
    volunteers: "250",
    ministries: "15",
    highlighted: true,
    features: [
      "250 volunteers",
      "15 teams",
      "Song library & service plans",
      "SongSelect file import",
      "Stage Sync (real-time worship)",
      "Multi-stage approval workflow",
      "Song usage tracking & CCLI reporting",
      "ProPresenter export",
      "Volunteer health dashboard",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$119/mo",
    volunteers: "500",
    ministries: "Unlimited",
    features: [
      "500 volunteers",
      "Unlimited teams",
      "Everything in Growth",
      "Advanced CCLI reporting",
      "Multi-site support",
      "API access",
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: "Custom",
    volunteers: "1000+",
    ministries: "Unlimited",
    features: [
      "Everything in Pro",
      "1000+ volunteers",
      "Dedicated onboarding",
      "White-label",
      "Custom integrations",
    ],
  },
];

// --- Church Ministry Templates (setup wizard suggestions) ---

export interface MinistryTemplate {
  name: string;
  description: string;
  color: string;
  requires_background_check: boolean;
  category: string;
}

export const MINISTRY_CATEGORY_LABELS: Record<string, string> = {
  worship: "Worship & Creative Arts",
  children_youth: "Children & Youth",
  hospitality: "Hospitality & Guest Services",
  operations: "Operations & Facilities",
  outreach: "Outreach & Service",
  fellowship: "Fellowship & Discipleship",
};

export const CHURCH_MINISTRY_TEMPLATES: MinistryTemplate[] = [
  // Worship & Creative Arts
  { name: "Worship Team", description: "Musicians and vocalists leading congregational worship", color: "#7B68EE", requires_background_check: false, category: "worship" },
  { name: "Choir", description: "Choral ensemble for worship services and special events", color: "#7B68EE", requires_background_check: false, category: "worship" },
  { name: "Audio/Visual", description: "Sound, lighting, cameras, and live stream production", color: "#3D8BF2", requires_background_check: false, category: "worship" },
  { name: "Media & Communications", description: "Graphics, social media, and church communications", color: "#3D8BF2", requires_background_check: false, category: "worship" },
  { name: "Dance Ministry", description: "Liturgical and praise dance", color: "#7B68EE", requires_background_check: false, category: "worship" },
  { name: "Drama / Creative Arts", description: "Skits, spoken word, and creative presentations", color: "#7B68EE", requires_background_check: false, category: "worship" },

  // Children & Youth
  { name: "Children's Ministry", description: "Sunday school and kids church for ages 3\u201312", color: "#F29E4C", requires_background_check: true, category: "children_youth" },
  { name: "Youth Ministry", description: "Student ministry for teens and young adults", color: "#F29E4C", requires_background_check: true, category: "children_youth" },
  { name: "Nursery", description: "Care for infants and toddlers during services", color: "#F29E4C", requires_background_check: true, category: "children_youth" },

  // Hospitality & Guest Services
  { name: "Greeting / Welcome Team", description: "Welcoming guests and members at entry points", color: "#81B29A", requires_background_check: false, category: "hospitality" },
  { name: "Ushers", description: "Seating, offering collection, and service flow", color: "#81B29A", requires_background_check: false, category: "hospitality" },
  { name: "First Impressions", description: "Information desk and new visitor care", color: "#81B29A", requires_background_check: false, category: "hospitality" },
  { name: "Hospitality / Caf\u00e9", description: "Coffee bar, meals, and fellowship refreshments", color: "#F2CC8F", requires_background_check: false, category: "hospitality" },

  // Operations & Facilities
  { name: "Parking / Traffic Team", description: "Directing traffic and assisting with parking", color: "#2D3047", requires_background_check: false, category: "operations" },
  { name: "Security / Safety Team", description: "Building security and emergency response", color: "#E84855", requires_background_check: true, category: "operations" },
  { name: "Facilities / Maintenance", description: "Building upkeep, setup, and teardown", color: "#2D3047", requires_background_check: false, category: "operations" },
  { name: "Transportation", description: "Shuttle services and ride coordination", color: "#2D3047", requires_background_check: true, category: "operations" },

  // Outreach & Service
  { name: "Missions / Outreach", description: "Local and global missions coordination", color: "#E07A5F", requires_background_check: false, category: "outreach" },
  { name: "Prayer Team", description: "Intercessory prayer during and outside services", color: "#E07A5F", requires_background_check: false, category: "outreach" },
  { name: "Benevolence", description: "Financial assistance and community aid", color: "#E07A5F", requires_background_check: false, category: "outreach" },

  // Fellowship & Discipleship
  { name: "Men's Ministry", description: "Men\u2019s fellowship, Bible studies, and events", color: "#3D8BF2", requires_background_check: false, category: "fellowship" },
  { name: "Women's Ministry", description: "Women\u2019s fellowship, Bible studies, and events", color: "#E07A5F", requires_background_check: false, category: "fellowship" },
  { name: "Small Groups / Life Groups", description: "Mid-week home groups and discipleship", color: "#81B29A", requires_background_check: false, category: "fellowship" },
];
