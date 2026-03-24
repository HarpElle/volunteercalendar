import { TIER_LIMITS } from "@/lib/constants";

export interface TierCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  tier: string;
}

export function checkMinistryLimit(
  tier: string,
  currentCount: number,
): TierCheckResult {
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const limit = limits.ministries;
  return {
    allowed: limit === Infinity || currentCount < limit,
    currentCount,
    limit: limit === Infinity ? -1 : limit,
    tier,
  };
}

export function checkVolunteerLimit(
  tier: string,
  currentCount: number,
): TierCheckResult {
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const limit = limits.volunteers;
  return {
    allowed: limit === Infinity || currentCount < limit,
    currentCount,
    limit: limit === Infinity ? -1 : limit,
    tier,
  };
}

const TIER_ORDER = ["free", "starter", "growth", "pro", "enterprise"];

/** Returns true if moving from oldTier to newTier is a downgrade. */
export function isDowngrade(oldTier: string, newTier: string): boolean {
  return TIER_ORDER.indexOf(newTier) < TIER_ORDER.indexOf(oldTier);
}

/** Computes human-readable list of features lost when moving from oldTier to newTier. */
export function computeLostFeatures(
  oldTier: string,
  newTier: string,
): string[] {
  const oldLimits = TIER_LIMITS[oldTier] || TIER_LIMITS.free;
  const newLimits = TIER_LIMITS[newTier] || TIER_LIMITS.free;
  const lost: string[] = [];

  if (oldLimits.worship_enabled && !newLimits.worship_enabled)
    lost.push("Song library & worship planning");
  if (oldLimits.checkin_enabled && !newLimits.checkin_enabled)
    lost.push("Children's check-in");
  if (oldLimits.rooms_enabled && !newLimits.rooms_enabled)
    lost.push("Room & resource booking");
  if (oldLimits.facility_sharing && !newLimits.facility_sharing)
    lost.push("Shared facility scheduling");
  if (oldLimits.multi_stage_approval && !newLimits.multi_stage_approval)
    lost.push("Multi-stage approval workflow");
  if (oldLimits.workflow_modes_all && !newLimits.workflow_modes_all)
    lost.push("Advanced scheduling workflow modes");
  if (oldLimits.ccli_csv_export && !newLimits.ccli_csv_export)
    lost.push("CCLI CSV export");
  if (oldLimits.checkin_pre_checkin_sms && !newLimits.checkin_pre_checkin_sms)
    lost.push("SMS pre-check-in");
  if (oldLimits.checkin_advanced_reports && !newLimits.checkin_advanced_reports)
    lost.push("Advanced check-in reports");
  if (oldLimits.checkin_multi_station && !newLimits.checkin_multi_station)
    lost.push("Multi-station check-in");
  if (oldLimits.checkin_guardian_sms && !newLimits.checkin_guardian_sms)
    lost.push("Guardian SMS notifications");
  if (oldLimits.rooms_recurring && !newLimits.rooms_recurring)
    lost.push("Recurring room bookings");
  if (oldLimits.rooms_public_calendar && !newLimits.rooms_public_calendar)
    lost.push("Public room calendar");

  return lost;
}

export interface OverLimitItem {
  resource: string;
  current: number;
  newLimit: number;
}

/** Computes which count-based resources exceed the new tier limits. */
export function computeOverLimitItems(
  newTier: string,
  counts: { ministries: number; volunteers: number; rooms: number },
): OverLimitItem[] {
  const limits = TIER_LIMITS[newTier] || TIER_LIMITS.free;
  const items: OverLimitItem[] = [];

  if (limits.ministries !== Infinity && counts.ministries > limits.ministries) {
    items.push({
      resource: "teams",
      current: counts.ministries,
      newLimit: limits.ministries,
    });
  }
  if (limits.volunteers !== Infinity && counts.volunteers > limits.volunteers) {
    items.push({
      resource: "volunteers",
      current: counts.volunteers,
      newLimit: limits.volunteers,
    });
  }
  if (limits.rooms_max !== Infinity && counts.rooms > limits.rooms_max) {
    items.push({
      resource: "rooms",
      current: counts.rooms,
      newLimit: limits.rooms_max,
    });
  }

  return items;
}
