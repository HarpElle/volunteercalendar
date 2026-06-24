/**
 * Child private-medical data access (Phase 3 — child-medical privacy).
 *
 * Background:
 *   `Person.child_profile` used to carry five sensitive minor fields
 *   (date_of_birth, allergies, medical_notes, medications,
 *   authorized_pickups) directly on the people doc, which
 *   `firestore.rules` lets ANY active church member read. That exposed
 *   child medical data to ordinary volunteers (Codex F-001).
 *
 *   Phase 3 moves those five fields into a private subcollection doc:
 *     churches/{churchId}/people/{personId}/private/medical
 *   gated by a stricter rule (admins + check-in roles only). The parent
 *   people doc keeps ONLY the safe summary fields (grade,
 *   default_room_id, has_alerts, photo_url).
 *
 * This module is the single chokepoint for reading + writing that
 * private data. Every API/server route that needs child medical fields
 * goes through here so the storage split lives in exactly one place
 * (same pattern as the notification-eligibility resolver).
 *
 * The migration is complete (all orgs backfilled 2026-06-23), so
 * `getChildPrivateMedical` reads the private subdoc only — the
 * migration-window parent `child_profile` fallback has been removed.
 * scripts/migrate-child-private-medical.ts remains for any future org.
 */

import type { firestore } from "firebase-admin";
import type { PersonAuthorizedPickup } from "@/lib/types";

/**
 * The five sensitive `child_profile` keys that move to the private
 * subdoc. Used by the parent-write sanitizer + the migration script +
 * the rules test. KEEP IN SYNC with firestore.rules
 * `parentPersonHasNoPrivateChildMedical`.
 */
export const PRIVATE_MEDICAL_FIELDS = [
  "date_of_birth",
  "allergies",
  "medical_notes",
  "medications",
  "authorized_pickups",
] as const;

/** Safe `child_profile` keys that REMAIN on the parent people doc. */
export const SAFE_CHILD_PROFILE_FIELDS = [
  "grade",
  "default_room_id",
  "has_alerts",
  "photo_url",
] as const;

export interface ChildPrivateMedical {
  date_of_birth: string | null;
  allergies: string | null;
  medical_notes: string | null;
  medications: string | null;
  authorized_pickups: PersonAuthorizedPickup[];
}

export function emptyChildPrivateMedical(): ChildPrivateMedical {
  return {
    date_of_birth: null,
    allergies: null,
    medical_notes: null,
    medications: null,
    authorized_pickups: [],
  };
}

/** Coerce a raw doc/`child_profile` object into a typed medical record. */
function normalizeMedical(
  src: Record<string, unknown> | undefined | null,
): ChildPrivateMedical {
  const s = src ?? {};
  return {
    date_of_birth: (s.date_of_birth as string | null) ?? null,
    allergies: (s.allergies as string | null) ?? null,
    medical_notes: (s.medical_notes as string | null) ?? null,
    medications: (s.medications as string | null) ?? null,
    authorized_pickups:
      (s.authorized_pickups as PersonAuthorizedPickup[] | undefined) ?? [],
  };
}

/** Ref to the private medical subdoc for a child Person. */
export function childPrivateMedicalRef(
  churchRef: firestore.DocumentReference,
  personId: string,
): firestore.DocumentReference {
  return churchRef
    .collection("people")
    .doc(personId)
    .collection("private")
    .doc("medical");
}

/**
 * Read a child's private medical data from the private subcollection.
 *
 * (The migration-window parent `child_profile` fallback was removed once
 * every org was migrated — all 36 children across all orgs, 2026-06-23 —
 * and all write paths create the private doc. Returns empty when the
 * private doc is absent.)
 */
export async function getChildPrivateMedical(
  churchRef: firestore.DocumentReference,
  personId: string,
): Promise<ChildPrivateMedical> {
  const snap = await childPrivateMedicalRef(churchRef, personId).get();
  return snap.exists ? normalizeMedical(snap.data()) : emptyChildPrivateMedical();
}

/**
 * Bulk variant for roster-style reads (room rosters, household lists,
 * emergency roster). Reads all private subdocs in one `getAll`.
 *
 * Returns a Map keyed by personId.
 */
export async function getChildPrivateMedicalBatch(
  churchRef: firestore.DocumentReference,
  personIds: string[],
): Promise<Map<string, ChildPrivateMedical>> {
  const result = new Map<string, ChildPrivateMedical>();
  if (personIds.length === 0) return result;

  const refs = personIds.map((id) => childPrivateMedicalRef(churchRef, id));
  const snaps = await churchRef.firestore.getAll(...refs);

  snaps.forEach((snap, i) => {
    const personId = personIds[i];
    result.set(
      personId,
      snap.exists ? normalizeMedical(snap.data()) : emptyChildPrivateMedical(),
    );
  });
  return result;
}

/**
 * Return a copy of a `child_profile`-shaped object with the five
 * private medical keys removed — i.e. the safe set that's allowed to
 * live on the parent people doc. Use on EVERY parent write so a child
 * profile never reintroduces medical data to the volunteer-readable
 * doc. Mirrors the `parentPersonHasNoPrivateChildMedical` rule.
 */
export function stripPrivateMedicalFromChildProfile<
  T extends Record<string, unknown>,
>(childProfile: T): Omit<T, (typeof PRIVATE_MEDICAL_FIELDS)[number]> {
  const clone = { ...childProfile };
  for (const key of PRIVATE_MEDICAL_FIELDS) {
    delete clone[key];
  }
  return clone as Omit<T, (typeof PRIVATE_MEDICAL_FIELDS)[number]>;
}

/** Extract the five private fields from a `child_profile`-shaped object. */
export function extractPrivateMedical(
  childProfile: Record<string, unknown> | undefined | null,
): ChildPrivateMedical {
  return normalizeMedical(childProfile);
}

/**
 * Write a child's private medical doc (Admin SDK). Stamps `updated_at`.
 * Pass a `WriteBatch` to enlist in an existing atomic write; otherwise
 * the set runs standalone.
 *
 * `nowIso` must be supplied by the caller (routes already compute a
 * timestamp) so this stays a pure write with no clock dependency.
 */
export function writeChildPrivateMedical(
  churchRef: firestore.DocumentReference,
  personId: string,
  medical: ChildPrivateMedical,
  nowIso: string,
  batch?: firestore.WriteBatch,
): void {
  const ref = childPrivateMedicalRef(churchRef, personId);
  const payload = { ...medical, updated_at: nowIso };
  if (batch) {
    batch.set(ref, payload, { merge: true });
  } else {
    void ref.set(payload, { merge: true });
  }
}
