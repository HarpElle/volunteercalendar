/**
 * Compatibility layer for the Volunteer → Person migration.
 *
 * Provides bidirectional conversion between the legacy Volunteer type
 * (used by existing UI components and the scheduling algorithm) and the
 * new unified Person type. This allows incremental migration without a
 * big-bang rewrite.
 *
 * Usage:
 * - Existing UI: fetch from `people` collection → personToLegacyVolunteer() → render
 * - Scheduler: fetch from `people` collection → personToSchedulable() → generate
 * - Migration: legacyVolunteerToPerson() → write to `people` collection
 */

import type {
  Person,
  Volunteer,
  SchedulableVolunteer,
  VolunteerStats,
  ImportSource,
} from "@/lib/types";

const DEFAULT_STATS: VolunteerStats = {
  times_scheduled_last_90d: 0,
  last_served_date: null,
  decline_count: 0,
  no_show_count: 0,
};

/**
 * Convert a Person document (new schema) into the legacy Volunteer shape.
 * Used during migration so existing UI components don't break.
 */
export function personToLegacyVolunteer(p: Person): Volunteer {
  const sp = p.scheduling_profile;
  return {
    id: p.id,
    church_id: p.church_id,
    name: p.name,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email ?? "",
    phone: p.phone,
    user_id: p.user_id,
    membership_id: p.membership_id,
    status: p.status === "archived" ? "archived" : p.status === "inactive" ? "inactive" : "active",
    ministry_ids: p.ministry_ids,
    role_ids: p.role_ids,
    campus_ids: p.campus_ids,
    household_id: p.household_ids[0] ?? null,
    photo_url: p.photo_url,
    availability: {
      blockout_dates: sp?.blockout_dates ?? [],
      recurring_unavailable: sp?.recurring_unavailable ?? [],
      preferred_frequency: sp?.preferred_frequency ?? 4,
      max_roles_per_month: sp?.max_roles_per_month ?? 4,
    },
    reminder_preferences: { channels: ["email"] },
    stats: p.stats ?? DEFAULT_STATS,
    imported_from: p.imported_from ?? "manual",
    background_check: p.background_check ?? undefined,
    role_constraints: p.role_constraints ?? undefined,
    volunteer_journey: p.volunteer_journey ?? undefined,
    created_at: p.created_at,
  };
}

/**
 * Convert a Person into the SchedulableVolunteer shape for the scheduling algorithm.
 * Returns null if the person is not an active volunteer with a scheduling profile.
 */
export function personToSchedulable(p: Person): SchedulableVolunteer | null {
  if (!p.is_volunteer || p.status !== "active" || !p.scheduling_profile) return null;
  const sp = p.scheduling_profile;

  return {
    id: p.id,
    name: p.name,
    email: p.email ?? "",
    phone: p.phone,
    user_id: p.user_id,
    membership_id: p.membership_id,
    status: p.status,
    ministry_ids: p.ministry_ids,
    role_ids: p.role_ids,
    campus_ids: p.campus_ids,
    household_id: p.household_ids[0] ?? null,
    photo_url: p.photo_url,
    availability: {
      blockout_dates: sp.blockout_dates,
      recurring_unavailable: sp.recurring_unavailable,
      preferred_frequency: sp.preferred_frequency,
      max_roles_per_month: sp.max_roles_per_month,
    },
    stats: p.stats ?? DEFAULT_STATS,
    background_check: p.background_check,
    role_constraints: p.role_constraints,
    volunteer_journey: p.volunteer_journey,
    imported_from: p.imported_from,
  };
}

/**
 * Convert a legacy Volunteer (old schema) into a Person document shape.
 * Used by the migration script to transform existing data.
 */
export function legacyVolunteerToPerson(
  v: Volunteer,
  householdId: string,
): Omit<Person, "id"> {
  const now = new Date().toISOString();
  const cleanPhone = v.phone?.replace(/\D/g, "");
  const firstName = v.first_name ?? v.name.split(" ")[0] ?? "";
  const lastName = v.last_name ?? v.name.split(" ").slice(1).join(" ") ?? "";

  return {
    church_id: v.church_id,
    household_ids: [householdId],
    person_type: "adult",
    first_name: firstName,
    last_name: lastName,
    preferred_name: null,
    name: v.name,
    search_name: v.name.toLowerCase(),
    email: v.email || null,
    phone: v.phone,
    search_phones: cleanPhone ? [cleanPhone] : [],
    photo_url: v.photo_url ?? null,
    status: v.status === "pending" ? "active" : v.status === "archived" ? "archived" : v.status,
    user_id: v.user_id,
    membership_id: v.membership_id,
    is_volunteer: true,
    ministry_ids: v.ministry_ids,
    role_ids: v.role_ids,
    campus_ids: v.campus_ids ?? [],
    scheduling_profile: {
      skills: [],
      max_services_per_month: v.availability.max_roles_per_month,
      blockout_dates: v.availability.blockout_dates,
      recurring_unavailable: v.availability.recurring_unavailable,
      preferred_frequency: v.availability.preferred_frequency,
      max_roles_per_month: v.availability.max_roles_per_month,
    },
    child_profile: null,
    stats: v.stats,
    imported_from: v.imported_from as ImportSource | null,
    background_check: v.background_check
      ? {
          status: v.background_check.status,
          expires_at: v.background_check.expires_at ?? null,
          provider: v.background_check.provider ?? null,
          checked_at: v.background_check.checked_at ?? null,
        }
      : null,
    role_constraints: v.role_constraints
      ? {
          conditional_roles: v.role_constraints.conditional_roles ?? [],
          allow_multi_role: v.role_constraints.allow_multi_role ?? false,
        }
      : null,
    volunteer_journey: v.volunteer_journey ?? null,
    qr_token: null,
    created_at: v.created_at,
    updated_at: now,
  };
}
