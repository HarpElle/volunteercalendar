import type { WorkflowMode, SubscriptionTier, ReminderChannel } from "@/lib/types";

/** Tier limits for gating */
export const TIER_LIMITS: Record<string, { volunteers: number; ministries: number }> = {
  free: { volunteers: 20, ministries: 1 },
  starter: { volunteers: 100, ministries: 5 },
  growth: { volunteers: 250, ministries: 15 },
  pro: { volunteers: 500, ministries: Infinity },
  enterprise: { volunteers: Infinity, ministries: Infinity },
};

export const WORKFLOW_MODES: { value: WorkflowMode; label: string; description: string }[] = [
  {
    value: "centralized",
    label: "Centralized",
    description: "Admin drafts full schedule. Team leads review and approve. Admin publishes globally.",
  },
  {
    value: "ministry-first",
    label: "Ministry-First",
    description: "Each ministry lead generates and publishes independently. Admin monitors conflicts.",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Auto-draft creates templates. Leaders tweak independently. Admin sees cross-ministry alerts.",
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
      "1 ministry",
      "Email reminders",
      "Basic scheduling",
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
      "5 ministries",
      "SMS + email reminders",
      "Advanced rotations",
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
      "15 ministries",
      "Full analytics",
      "Substitution engine",
      "Integrations",
      "Multi-ministry coordination",
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
      "Unlimited ministries",
      "API access",
      "Custom rules",
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
