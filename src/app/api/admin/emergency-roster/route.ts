/**
 * GET /api/admin/emergency-roster?church_id=...&date=YYYY-MM-DD?&reason=...
 *
 * Wave 10 W10-4. The cross-room evacuation roster — every child
 * currently checked in across the whole church campus, grouped by
 * room, with FULL medical + parent-contact data regardless of the
 * org's normal `medical_visibility` config.
 *
 * Why this bypasses medical_visibility:
 *   In an evacuation, lockdown, severe-weather event, or missing-
 *   child response, the marshal / EMT needs the data immediately.
 *   The HIPAA-aware config that gates the kiosk and teacher dashboard
 *   is an everyday-display preference; it doesn't have the standing
 *   to block emergency response.
 *
 * Security trade-off:
 *   - Strict admin/owner-only role gate (not arbitrary signed-in
 *     members; not the kiosk operator token).
 *   - Every fetch lands one `admin.emergency_roster_accessed` audit
 *     row. No de-duplication — this is the trail the board reviews.
 *   - Caller MUST acknowledge the consent modal in the UI; the
 *     acknowledged `reason` (free text, 280 char cap) becomes part
 *     of the audit metadata so an out-of-context access ("3am, no
 *     event in the calendar") can be traced to its stated reason.
 *
 * Auth: Bearer JWT + membership role in [admin, owner].
 *
 * Response shape:
 *   {
 *     generated_at: ISO,
 *     date: 'YYYY-MM-DD',
 *     church_name: string,
 *     total_children: number,
 *     total_rooms: number,
 *     rooms: [{
 *       room: { id, name },
 *       children: [{
 *         session_id, child_id, child_name, grade,
 *         checked_in_at, has_alerts,
 *         allergies, medical_notes, medications,
 *         parent: { name?, phone? },          // primary guardian, UNMASKED
 *         authorized_pickups: [{ name, relationship?, phone? }],
 *       }]
 *     }],
 *     unroomed: [...]   // any active session without room_id (edge case)
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import {
  loadChild,
  loadHouseholdPhone,
  churchServiceDate,
} from "@/lib/server/checkin-helpers";
import { audit, userActor } from "@/lib/server/audit";
import {
  getChildPrivateMedicalBatch,
  type ChildPrivateMedical,
} from "@/lib/server/child-medical";
import { log } from "@/lib/log";
import type {
  CheckInSession,
  Person,
  PersonAuthorizedPickup,
  Room,
} from "@/lib/types";

const REASON_MAX_CHARS = 280;

async function authUid(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

interface RosterChild {
  session_id: string;
  child_id: string;
  child_name: string;
  grade?: string;
  checked_in_at: string;
  has_alerts: boolean;
  allergies: string | null;
  medical_notes: string | null;
  medications: string | null;
  parent: { name: string | null; phone: string | null };
  authorized_pickups: Array<{
    name: string;
    relationship: string | null;
    phone: string | null;
  }>;
  household_id: string;
  /** W10 attendance (Jason 2026-06-02): teacher-marked presence.
   *  false = teacher reported the child is NOT in the room — EMTs
   *  + the evacuation marshal need this to avoid wasted search
   *  time. Null = not marked (treat as "unknown — search per
   *  normal protocol"). */
  attendance_present: boolean | null;
}

export async function GET(req: NextRequest) {
  // Tighter rate limit than the everyday roster — emergency access
  // should be infrequent and the higher rate would be either a script
  // probing the surface OR a UI bug. Either way: 6/min suffices.
  const limited = rateLimit(req, { limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }
    const explicitDate = req.nextUrl.searchParams.get("date");
    const reasonRaw = req.nextUrl.searchParams.get("reason") ?? "";
    const reason = reasonRaw
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, REASON_MAX_CHARS);

    // Membership + tier gate. requireModuleTier resolves role too.
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "query",
    });
    if (!gate.ok) return gate.response;

    const role = gate.ctx.role;
    if (role !== "admin" && role !== "owner") {
      return NextResponse.json(
        { error: "Only church admins or owners can access the emergency roster" },
        { status: 403 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);
    const churchSnap = await churchRef.get();
    const churchName =
      (churchSnap.exists ? (churchSnap.data()?.name as string) : "") ||
      "This church";

    // Service date = explicit param, else today in the CHURCH timezone (not
    // UTC). A safety-critical surface: the UTC default silently dropped an
    // actively checked-in child during the evening rollover (Codex P2-1).
    const date = churchServiceDate(
      churchSnap.data()?.timezone as string | undefined,
      explicitDate,
    );

    // Active sessions for the date. Filter "active" in-process to
    // avoid the Firestore null-equality skip.
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "==", date)
      .get();
    const activeSessions = sessionsSnap.docs
      .map((d) => ({ id: d.id, data: d.data() as CheckInSession }))
      .filter((s) => (s.data.checked_out_at ?? null) === null);

    // Group active session docs by room_id (or null for unroomed).
    // CRITICAL: coerce empty-string / whitespace-only room_id to null so
    // those sessions land in the unroomed bucket instead of crashing
    // `churchRef.collection("rooms").doc("").get()` further down. The
    // Firestore admin SDK throws synchronously on `.doc("")`. Codex
    // W10-4 finding 1.
    const sessionsByRoom = new Map<string | null, typeof activeSessions>();
    for (const s of activeSessions) {
      const raw = s.data.room_id;
      const trimmed =
        typeof raw === "string" && raw.trim().length > 0 ? raw : null;
      const arr = sessionsByRoom.get(trimmed) ?? [];
      arr.push(s);
      sessionsByRoom.set(trimmed, arr);
    }

    // Resolve room metadata. Single batched read per room id.
    const roomIds = [...sessionsByRoom.keys()].filter(
      (k): k is string => k !== null,
    );
    const roomMap = new Map<string, Room>();
    await Promise.all(
      roomIds.map(async (rid) => {
        try {
          const snap = await churchRef.collection("rooms").doc(rid).get();
          if (snap.exists) roomMap.set(rid, snap.data() as Room);
        } catch (err) {
          // A malformed room_id (e.g., contains "/" or other invalid
          // path characters) blows up .doc(rid). Log + carry on — the
          // unnamed-room fallback below will surface the session under
          // "Unnamed room" so the marshal still sees the child.
          log.warn("[emergency-roster] failed to load room", {
            room_id: rid,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    // Phase 3: the five private medical fields (incl. authorized_pickups)
    // moved out of the parent child_profile into a private subdoc. This
    // roster iterates EVERY checked-in child, so read them in ONE batched
    // getAll instead of a per-child fetch. Build a fallback Map from each
    // child's parent child_profile (one batched getAll of the people docs)
    // so un-migrated children still resolve during the migration window.
    const childIds = [
      ...new Set(
        activeSessions
          .map((s) => s.data.child_id)
          .filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          ),
      ),
    ];
    const fallbackByPersonId = new Map<
      string,
      Record<string, unknown> | null | undefined
    >();
    if (childIds.length > 0) {
      const personSnaps = await adminDb.getAll(
        ...childIds.map((id) => churchRef.collection("people").doc(id)),
      );
      personSnaps.forEach((snap, i) => {
        const id = childIds[i];
        const cp = snap.exists
          ? ((snap.data() as { child_profile?: Record<string, unknown> })
              ?.child_profile ?? null)
          : null;
        fallbackByPersonId.set(id, cp);
      });
    }
    const medicalById = await getChildPrivateMedicalBatch(
      churchRef,
      childIds,
      fallbackByPersonId,
    );

    // Helper: build the per-child payload. Loads child + household
    // phone, plus the private medical record (incl. authorized_pickups)
    // from the batched read above. Tolerant of missing / malformed ids —
    // an evacuation tool MUST NOT 500 because one session has bad
    // data; the marshal still sees the others.
    const buildChild = async (
      session: CheckInSession,
      sessionId: string,
    ): Promise<RosterChild> => {
      const validChildId =
        typeof session.child_id === "string" && session.child_id.trim().length > 0
          ? session.child_id
          : null;
      const validHouseholdId =
        typeof session.household_id === "string" &&
        session.household_id.trim().length > 0
          ? session.household_id
          : null;

      const child = validChildId ? await loadChild(churchRef, validChildId) : null;
      const phone = validHouseholdId
        ? ((await loadHouseholdPhone(churchRef, validHouseholdId)) ?? null)
        : null;
      const displayName = child?.display_name ?? "Unknown";
      const lastName = child?.last_name ?? "";
      // Phase 3: the private medical record (allergies/medical_notes/
      // medications/authorized_pickups) comes from the batched read above.
      // loadChild returns a flattened shape that doesn't carry pickups.
      const medical: ChildPrivateMedical | undefined = validChildId
        ? medicalById.get(validChildId)
        : undefined;
      const rawPickups: PersonAuthorizedPickup[] =
        medical?.authorized_pickups ?? [];
      // Try the household primary's first/last name for the parent
      // label; falls back to null when absent.
      let parentName: string | null = null;
      if (validHouseholdId) {
        try {
          const hhSnap = await churchRef
            .collection("households")
            .doc(validHouseholdId)
            .get();
          const primaryGuardianId = hhSnap.exists
            ? ((hhSnap.data()?.primary_guardian_id as string | null) ?? null)
            : null;
          if (primaryGuardianId) {
            const primarySnap = await churchRef
              .collection("people")
              .doc(primaryGuardianId)
              .get();
            if (primarySnap.exists) {
              const p = primarySnap.data() as Person;
              parentName =
                [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
            }
          }
        } catch {
          // Households doc shape varies for legacy orgs; best-effort.
        }
      }

      return {
        session_id: sessionId,
        child_id: session.child_id ?? "",
        child_name: `${displayName} ${lastName}`.trim() || "Unknown child",
        grade: child?.grade,
        checked_in_at: session.checked_in_at,
        has_alerts: child?.has_alerts ?? false,
        // EMERGENCY OVERRIDE: read raw values from the medical snapshot
        // (or the private medical record fallback). No medical_visibility
        // gating.
        allergies:
          session.medical_snapshot?.allergies ?? medical?.allergies ?? null,
        medical_notes:
          session.medical_snapshot?.medical_notes ??
          medical?.medical_notes ??
          null,
        medications:
          session.medical_snapshot?.medications ??
          medical?.medications ??
          null,
        parent: { name: parentName, phone },
        authorized_pickups: rawPickups.map((p) => ({
          name: p.name,
          relationship: p.relationship,
          phone: p.phone,
        })),
        household_id: session.household_id ?? "",
        attendance_present: session.attendance_present ?? null,
      };
    };

    // Wrap each buildChild so one bad session can't 500 the whole
    // roster. An evacuation tool must be all-or-something, not
    // all-or-nothing. Failures land as a "Data load failed" stub
    // row so the marshal at least knows a session was here.
    const safeBuildChild = async (
      session: CheckInSession,
      sessionId: string,
    ): Promise<RosterChild> => {
      try {
        return await buildChild(session, sessionId);
      } catch (err) {
        log.error("[emergency-roster] buildChild failed", {
          session_id: sessionId,
          child_id: session.child_id,
          household_id: session.household_id,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          session_id: sessionId,
          child_id: session.child_id ?? "",
          child_name: "⚠ Data load failed — check kiosk roster",
          checked_in_at: session.checked_in_at ?? "",
          has_alerts: false,
          allergies: null,
          medical_notes: null,
          medications: null,
          parent: { name: null, phone: null },
          authorized_pickups: [],
          household_id: session.household_id ?? "",
          attendance_present: session.attendance_present ?? null,
        };
      }
    };

    // Build per-room sections in parallel; preserve room ordering by
    // name to give the marshal a predictable layout on the print.
    const rooms = await Promise.all(
      roomIds.map(async (rid) => {
        const room = roomMap.get(rid);
        const sessions = sessionsByRoom.get(rid) ?? [];
        const children = await Promise.all(
          sessions.map((s) => safeBuildChild(s.data, s.id)),
        );
        children.sort((a, b) => a.child_name.localeCompare(b.child_name));
        return {
          room: { id: rid, name: room?.name ?? "Unnamed room" },
          children,
        };
      }),
    );
    rooms.sort((a, b) => a.room.name.localeCompare(b.room.name));

    // Edge case: any sessions without a room_id (legacy or imported)
    // get a dedicated section so the marshal sees them too.
    const unroomedSessions = sessionsByRoom.get(null) ?? [];
    const unroomed = await Promise.all(
      unroomedSessions.map((s) => safeBuildChild(s.data, s.id)),
    );
    unroomed.sort((a, b) => a.child_name.localeCompare(b.child_name));

    const totalChildren = rooms.reduce(
      (a, r) => a + r.children.length,
      unroomed.length,
    );

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "admin.emergency_roster_accessed",
      target_type: "church",
      target_id: churchId,
      metadata: {
        date,
        total_children: totalChildren,
        total_rooms: rooms.length,
        unroomed_count: unroomed.length,
        reason_provided: reason.length > 0,
        reason: reason || null,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      date,
      church_name: churchName,
      total_children: totalChildren,
      total_rooms: rooms.length,
      rooms,
      unroomed,
    });
  } catch (error) {
    log.error("[GET /api/admin/emergency-roster]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
