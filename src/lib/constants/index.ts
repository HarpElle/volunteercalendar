import type { WorkflowMode, SubscriptionTier, ReminderChannel } from "@/lib/types";

/** Tier limits for gating */
export const TIER_LIMITS: Record<string, {
  volunteers: number;
  ministries: number;
  short_links: number;
  roles_per_service: number;
  active_events: number;
  roles_per_event: number;
}> = {
  free:       { volunteers: 20,       ministries: 1,        short_links: 0,   roles_per_service: 3,  active_events: 1,        roles_per_event: 2 },
  starter:    { volunteers: 100,      ministries: 5,        short_links: 3,   roles_per_service: 8,  active_events: 5,        roles_per_event: 5 },
  growth:     { volunteers: 250,      ministries: 15,       short_links: 10,  roles_per_service: 20, active_events: 15,       roles_per_event: 15 },
  pro:        { volunteers: 500,      ministries: Infinity,  short_links: 25,  roles_per_service: 50, active_events: Infinity,  roles_per_event: 50 },
  enterprise: { volunteers: Infinity, ministries: Infinity,  short_links: 100, roles_per_service: Infinity, active_events: Infinity, roles_per_event: Infinity },
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
    ministries: "1",
    features: [
      "Up to 20 volunteers",
      "1 team",
      "3 roles per service",
      "1 active event",
      "Email reminders",
      "iCal calendar feeds",
    ],
  },
  {
    tier: "starter",
    name: "Starter",
    price: "$19/mo",
    volunteers: "100",
    ministries: "5",
    features: [
      "100 volunteers",
      "5 teams",
      "8 roles per service",
      "5 active events",
      "SMS + email reminders",
      "Analytics",
    ],
  },
  {
    tier: "growth",
    name: "Growth",
    price: "$49/mo",
    volunteers: "250",
    ministries: "15",
    highlighted: true,
    features: [
      "250 volunteers",
      "15 teams",
      "20 roles per service",
      "15 active events",
      "Full analytics",
      "Integrations",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$99/mo",
    volunteers: "500",
    ministries: "Unlimited",
    features: [
      "500 volunteers",
      "Unlimited teams",
      "50 roles per service",
      "Unlimited events",
      "API access",
      "White-label",
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: "Custom",
    volunteers: "1000+",
    ministries: "Unlimited",
    features: [
      "Multi-site support",
      "1000+ volunteers",
      "Dedicated support",
      "White-label",
      "Custom integrations",
    ],
  },
];
