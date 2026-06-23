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
import { todayInTimezone } from "@/lib/utils/date";
import { getChildPrivateMedical } from "@/lib/server/child-medical";

// ─── Service-date resolution ───────────────────────────────────────────────
// The check-in "service date" (YYYY-MM-DD) is the day a session belongs to.
// The kiosk stamps it in church-LOCAL time. Read surfaces MUST anchor their
// default "today" to the same church-local date — NOT UTC.
//
// Why this is centralized: every read route used to default to
// `new Date().toISOString().split("T")[0]`, which is UTC. For any US church
// that rolls the date over in the evening (Abbott Loop is America/Anchorage,
// UTC-8 — 8:47pm local is already the next UTC day), so the emergency roster,
// teacher dashboard, and admin room views silently showed zero actively
// checked-in children. Codex 2026-06-22 caught the whole cluster.

/**
 * Resolve the service date from an explicit query param, else today in the
 * church's timezone. Use the sync `churchServiceDate` variant when the church
 * doc (or just its timezone) is already in hand to avoid a redundant read.
 */
export async function resolveChurchServiceDate(
  churchRef: firestore.DocumentReference,
  explicitDate?: string | null,
): Promise<string> {
  if (explicitDate) return explicitDate;
  const snap = await churchRef.get();
  const tz = snap.exists
    ? ((snap.data()?.timezone as string | undefined) ?? null)
    : null;
  return todayInTimezone(tz);
}

/** Sync service-date resolver for callers that already loaded the timezone. */
export function churchServiceDate(
  timezone: string | undefined | null,
  explicitDate?: string | null,
): string {
  return explicitDate || todayInTimezone(timezone);
}

// ─── Check-in room eligibility ─────────────────────────────────────────────
// IMPORTANT: `checkin_enabled` is a CHURCH-level FeatureFlags field, NOT a
// Room field. Querying `where("checkin_enabled","==",true)` on the rooms
// collection matches nothing (Codex 2026-06-22 P3-1/P3-3). A room participates
// in children's check-in when it is active and has at least one configured
// grade — the same predicate Room Setup and `assignRoomByGrade` use.

/** True if a room participates in children's check-in (active + has grades). */
export function isCheckinRoom(room: {
  is_active?: boolean;
  default_grades?: unknown;
}): boolean {
  return (
    room.is_active !== false &&
    Array.isArray(room.default_grades) &&
    room.default_grades.length > 0
  );
}

/** Every check-in room for a church (id + name + capacity), name-sorted. */
export async function listCheckinRooms(
  churchRef: firestore.DocumentReference,
): Promise<Array<{ id: string; name: string; capacity: number | null }>> {
  const snap = await churchRef.collection("rooms").get();
  const out: Array<{ id: string; name: string; capacity: number | null }> = [];
  for (const d of snap.docs) {
    const data = d.data() as {
      is_active?: boolean;
      default_grades?: unknown;
      name?: string;
      capacity?: number;
    };
    if (!isCheckinRoom(data)) continue;
    out.push({
      id: d.id,
      name: data.name || "Room",
      capacity: data.capacity ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Normalized child shape used everywhere downstream. */
export interface NormalizedChild {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  has_alerts: boolean;
  allergies?: string;
  medical_notes?: string;
  /** Wave 9 P0-4: medications split out from medical_notes for
   *  per-field HIPAA-aware visibility gating. Legacy child / Person
   *  docs without this field read as undefined. */
  medications?: string;
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
      medications: (c.medications as string) || undefined,
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
    // Phase 3: medical fields (allergies/medical_notes/medications) now live
    // in the private subcollection. Dual-read with `cp` as the legacy
    // fallback so un-migrated children still resolve during the migration
    // window. Safe fields (has_alerts/default_room_id/grade) stay on parent.
    const medical = await getChildPrivateMedical(churchRef, childId, cp);
    return {
      id: personSnap.id,
      first_name,
      last_name: (p.last_name as string) || "",
      preferred_name: (p.preferred_name as string) || null,
      has_alerts: !!cp.has_alerts,
      allergies: medical.allergies || undefined,
      medical_notes: medical.medical_notes || undefined,
      medications: medical.medications || undefined,
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

/** A room configured to accept check-ins for one or more grades. */
export interface AssignedRoom {
  id: string;
  name: string;
  capacity?: number;
  overflow_room_id?: string;
}

/**
 * Look up an active check-in room whose configured `default_grades` includes
 * the child's grade. Returns null if no matching room is found.
 *
 * When multiple rooms match a grade (rare for small orgs but possible), the
 * first room with available capacity is returned; ties go to the alphabetic
 * first name so behavior is stable. Rooms with no capacity configured are
 * treated as having unlimited capacity. Inactive rooms (`is_active === false`)
 * are skipped.
 *
 * Why this exists: prior to this helper the kiosk check-in route only resolved
 * a room via (a) operator override or (b) the child's own `default_room_id`.
 * The Add Child UI doesn't collect `default_room_id`, so freshly-added
 * children always landed in "Unassigned" even when a room had been configured
 * for their grade. The room had the contract (`default_grades`); we just
 * weren't honoring it at check-in time.
 */
export async function assignRoomByGrade(
  churchRef: firestore.DocumentReference,
  grade: string | undefined,
  serviceDate: string,
): Promise<AssignedRoom | null> {
  if (!grade) return null;
  const normalized = grade.toLowerCase().replace(/_/g, "-");

  // Firestore array-contains on `default_grades`. Stored values are the
  // canonical lowercase ChildGrade strings (e.g. "kindergarten").
  const candidatesSnap = await churchRef
    .collection("rooms")
    .where("default_grades", "array-contains", normalized)
    .get();

  if (candidatesSnap.empty) return null;

  const candidates = candidatesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as AssignedRoom & { is_active?: boolean })
    .filter((r) => r.is_active !== false)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multi-room tie: pick the first room with remaining capacity. Rooms with
  // no capacity are treated as unlimited.
  for (const room of candidates) {
    if (!room.capacity) {
      return room;
    }
    // Codex P0-5C: drop where(checked_out_at,null) — Firestore
    // null-equality skips docs where the field is absent. In-process
    // filter is defense-in-depth for any legacy session docs.
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "==", serviceDate)
      .where("room_id", "==", room.id)
      .get();
    const activeCount = sessionsSnap.docs.filter(
      (d) => (d.data().checked_out_at ?? null) === null,
    ).length;
    if (activeCount < room.capacity) {
      return room;
    }
  }

  // Every matching room is full. Return the first match anyway so capacity
  // overflow / SMS logic downstream can still react; better than silently
  // dropping the child into "Unassigned".
  return candidates[0];
}
