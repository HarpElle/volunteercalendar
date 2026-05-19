"use client";

import type { SubscriptionTier } from "@/lib/types";
import { TIER_LIMITS } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Tier-lock primitives                                               */
/* ------------------------------------------------------------------ */

export type ModuleId = "rooms" | "checkin" | "worship";

const MODULE_FLAGS: Record<ModuleId, keyof (typeof TIER_LIMITS)["free"]> = {
  rooms: "rooms_enabled",
  checkin: "checkin_enabled",
  worship: "worship_enabled",
};

const TIER_ORDER: SubscriptionTier[] = [
  "free",
  "starter",
  "growth",
  "pro",
  "enterprise",
];

/**
 * For a given module, returns the lowest tier whose TIER_LIMITS unlocks it.
 * Renders the per-module badge text (STARTER / GROWTH / PRO).
 */
function firstUnlockingTier(moduleId: ModuleId): SubscriptionTier {
  const flag = MODULE_FLAGS[moduleId];
  for (const tier of TIER_ORDER) {
    if (TIER_LIMITS[tier]?.[flag] === true) return tier;
  }
  return "growth";
}

export interface TierGate {
  enabled: boolean;
  tierRequired: SubscriptionTier;
  badgeLabel: string;
}

export function useTierGate(
  moduleId: ModuleId,
  currentTier: SubscriptionTier | null | undefined,
): TierGate {
  const flag = MODULE_FLAGS[moduleId];
  const enabled = !!(currentTier && TIER_LIMITS[currentTier]?.[flag] === true);
  const tierRequired = firstUnlockingTier(moduleId);
  return {
    enabled,
    tierRequired,
    badgeLabel: tierRequired.toUpperCase(),
  };
}

/* ------------------------------------------------------------------ */
/*  Lock badge component                                               */
/* ------------------------------------------------------------------ */

export function TierLockBadge({ tierLabel }: { tierLabel: string }) {
  return (
    <span
      className="ml-auto inline-flex items-center gap-1 rounded-full bg-vc-sand/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted"
      aria-hidden="true"
    >
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
      {tierLabel}
    </span>
  );
}
