/**
 * Server-side helpers for the unified/legacy collection drift in Children's
 * Check-In.
 *
 * Background:
 *   Pro-tier orgs store children as `Person` docs in `churches/{c}/people`
 *   (with `person_type === "child"`), and households as `UnifiedHousehold`
 *   docs in `churches/{c}/households`. Legacy orgs use `churches/{c}/children`
 *   and `churches/{c}/checkin_households` instead.
 *
 *   The kiosk lookup endpoint (`/api/checkin/lookup`) already returns Person
 *   doc IDs for unified orgs. Sessions written by `/api/checkin/checkin` then
 *   reference those Person IDs as `child_id`. Several downstream consumers
 *   tried `collection("children").doc(child_id).get()` and silently skipped
 *   the session when the lookup failed, which is why kiosk check-ins were
 *   invisible to the admin dashboard, daily/by-room reports, CSV exports,
 *   teacher room views, and admin checkout in unified mode.
 *
 *   These helpers look in both collections so each caller can stop caring
 *   which storage layout the org uses.
 */

import type { firestore } from "firebase-admin";

/** Normalized child shape used everywhere downstream. */
export interface NormalizedChild {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  has_alerts: boolean;
  allergies?: string;
  medical_notes?: string;
  default_room_id?: string;
  grade?: string;
  /** Convenience: preferred_name or first_name. */
  display_name: string;
}

/**
 * Load a child by ID, transparently handling both unified `people` Person
 * docs and legacy `children` docs. Returns null if neither store has it.
 */
export async function loadChild(
  churchRef: firestore.DocumentReference,
  childId: string,
): Promise<NormalizedChild | null> {
  // Try legacy children first — cheaper for legacy orgs and a no-op .exists
  // check for unified orgs.
  const childSnap = await churchRef.collection("children").doc(childId).get();
  if (childSnap.exists) {
    const c = childSnap.data()!;
    const first_name = (c.first_name as string) || "";
    return {
      id: childSnap.id,
      first_name,
      last_name: (c.last_name as string) || "",
      preferred_name: (c.preferred_name as string) || null,
      has_alerts: !!c.has_alerts,
      allergies: (c.allergies as string) || undefined,
      medical_notes: (c.medical_notes as string) || undefined,
      default_room_id: (c.default_room_id as string) || undefined,
      grade: (c.grade as string) || undefined,
      display_name: (c.preferred_name as string) || first_name,
    };
  }

  // Fall back to unified Person doc
  const personSnap = await churchRef.collection("people").doc(childId).get();
  if (personSnap.exists) {
    const p = personSnap.data()!;
    if (p.person_type !== "child") return null;
    const cp = (p.child_profile as Record<string, unknown> | undefined) || {};
    const first_name = (p.first_name as string) || "";
    return {
      id: personSnap.id,
      first_name,
      last_name: (p.last_name as string) || "",
      preferred_name: (p.preferred_name as string) || null,
      has_alerts: !!cp.has_alerts,
      allergies: (cp.allergies as string) || undefined,
      medical_notes: (cp.medical_notes as string) || undefined,
      default_room_id: (cp.default_room_id as string) || undefined,
      grade: (cp.grade as string) || undefined,
      display_name: (p.preferred_name as string) || first_name,
    };
  }

  return null;
}

/**
 * Load a household's primary guardian phone number, handling both unified
 * `households` (where phone lives on the linked adult Person) and legacy
 * `checkin_households` (where it's a top-level field on the household).
 *
 * Returns null if the household isn't found or has no phone on record.
 */
export async function loadHouseholdPhone(
  churchRef: firestore.DocumentReference,
  householdId: string,
): Promise<string | null> {
  const legacySnap = await churchRef
    .collection("checkin_households")
    .doc(householdId)
    .get();
  if (legacySnap.exists) {
    const phone = legacySnap.data()?.primary_guardian_phone;
    return phone ? String(phone) : null;
  }

  const unifiedSnap = await churchRef
    .collection("households")
    .doc(householdId)
    .get();
  if (!unifiedSnap.exists) return null;

  // Find the first adult Person linked to this household
  const adultsSnap = await churchRef
    .collection("people")
    .where("household_ids", "array-contains", householdId)
    .where("person_type", "==", "adult")
    .limit(1)
    .get();
  if (adultsSnap.empty) return null;
  const phone = adultsSnap.docs[0].data()?.phone;
  return phone ? String(phone) : null;
}
