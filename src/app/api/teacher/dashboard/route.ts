/**
 * GET /api/teacher/dashboard?church_id=...&date=YYYY-MM-DD?
 *
 * Wave 10 W10-2. Returns a person-anchored teacher dashboard: every
 * room the signed-in volunteer is currently checked into TODAY,
 * with the room's children roster + ratio status + parent contact.
 *
 * Distinct from /api/checkin/room/[roomId]:
 *   - /checkin/room/* is STATION-anchored (room view token, anyone
 *     with the URL can see it; used for wall-mount tablets in the
 *     room).
 *   - /teacher/dashboard is PERSON-anchored (Bearer JWT, only the
 *     signed-in volunteer themself sees it). Same render payload
 *     per room, but only for rooms where the caller is checked in.
 *
 * Auth:
 *   - Bearer JWT — caller's Firebase Auth UID. Must map to a Person
 *     doc in this church with person_type=adult and is_volunteer.
 *   - The volunteer must have at least one active
 *     `RoomVolunteerCheckIn` for the target service_date; else the
 *     response carries `rooms: []` (the page renders a friendly
 *     "you're not checked into a room" empty state).
 *
 * Auto-refresh polling:
 *   - The page polls every 30s. To avoid filling audit_logs with
 *     `teacher.dashboard_viewed` rows on every poll, we emit ONCE
 *     per (church_id, person_id, date) tuple per ~5-minute window.
 *     The de-dup window is in-process per Vercel function instance
 *     — over multiple instances we may emit a handful per window
 *     instead of 1, which is fine.
 *
 * Medical visibility:
 *   - Same `medical_visibility` config that the kiosk roster uses.
 *     Returns the per-field render plan + the legacy flat fields
 *     for fields visible without tap-to-reveal.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import {
  loadChild,
  loadHouseholdPhone,
  resolveChurchServiceDate,
  listCheckinRooms,
} from "@/lib/server/checkin-helpers";
import { hasClassroomOversight } from "@/lib/server/classroom-oversight";
import {
  getRosterFieldStates,
  resolveMedicalVisibility,
  type RosterFieldState,
} from "@/lib/server/medical-visibility";
import {
  DEFAULT_RATIO_WARNING_PERCENT,
  evaluateRatio,
} from "@/lib/server/ratio";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type {
  CheckInSession,
  CheckInSettings,
  Room,
  RoomVolunteerCheckIn,
} from "@/lib/types";

// In-memory de-dup cache for the dashboard_viewed audit emit. Key is
// `${churchId}:${personId}:${date}`; value is the wall-clock ms of
// the most recent emit. Cleared on a sliding 10-minute window.
const AUDIT_DEDUP_MS = 5 * 60_000;
const auditDedupCache = new Map<string, number>();

function shouldEmitViewAudit(
  churchId: string,
  personId: string,
  date: string,
): boolean {
  const key = `${churchId}:${personId}:${date}`;
  const last = auditDedupCache.get(key);
  const now = Date.now();
  if (last && now - last < AUDIT_DEDUP_MS) return false;
  auditDedupCache.set(key, now);
  // Opportunistic cleanup so the cache doesn't grow unbounded.
  if (auditDedupCache.size > 2_000) {
    const cutoff = now - 2 * AUDIT_DEDUP_MS;
    for (const [k, v] of auditDedupCache) {
      if (v < cutoff) auditDedupCache.delete(k);
    }
  }
  return true;
}

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

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
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
    // Tier gate (allowAnonymous because the caller isn't routed via
    // an admin-role check — we use the Person + active-room-checkin
    // combination as the gate).
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "query",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Service date = explicit param, else today in the CHURCH timezone
    // (not UTC — see resolveChurchServiceDate). Without this, the evening
    // UTC rollover hides actively checked-in rooms (Codex P4-1).
    const date = await resolveChurchServiceDate(
      churchRef,
      req.nextUrl.searchParams.get("date"),
    );

    // Classroom oversight (owner/admin/checkin_manager flag): may view
    // every check-in-enabled room without being checked in as a room
    // volunteer. Everyone else stays person-anchored.
    const oversight = await hasClassroomOversight(churchId, uid);

    // Resolve the caller's Person doc. Must be an adult volunteer in
    // this church — unless they carry classroom oversight (an admin
    // may not have a Person record at all).
    const personSnap = await churchRef
      .collection("people")
      .where("user_id", "==", uid)
      .where("person_type", "==", "adult")
      .limit(1)
      .get();
    if (personSnap.empty && !oversight) {
      return NextResponse.json(
        { error: "Not registered as a volunteer in this church" },
        { status: 403 },
      );
    }
    let personId: string | null = null;
    let personName = "Check-In Team";
    if (!personSnap.empty) {
      personId = personSnap.docs[0].id;
      const personData = personSnap.docs[0].data();
      personName =
        (personData.preferred_name as string) ||
        (personData.first_name as string) ||
        (personData.name as string) ||
        "Teacher";
    } else {
      const userSnap = await adminDb.doc(`users/${uid}`).get();
      personName = (userSnap.data()?.display_name as string) || personName;
    }

    // Which rooms can the caller see?
    //   - oversight: every check-in-enabled room (the admin "drop into
    //     any classroom" path).
    //   - teacher: rooms with an active RoomVolunteerCheckIn for them.
    let roomIds: string[] = [];
    if (oversight) {
      // Every check-in room (active + has grades) — NOT a `checkin_enabled`
      // query; that field lives on the church, not the room.
      const checkinRooms = await listCheckinRooms(churchRef);
      roomIds = checkinRooms.map((r) => r.id);
    } else if (personId) {
      const myCheckinsSnap = await churchRef
        .collection("roomVolunteerCheckins")
        .where("person_id", "==", personId)
        .where("service_date", "==", date)
        .get();
      const myActiveCheckins = myCheckinsSnap.docs
        .map((d) => d.data() as RoomVolunteerCheckIn)
        .filter((v) => (v.checked_out_at ?? null) === null);
      roomIds = [...new Set(myActiveCheckins.map((c) => c.room_id))];
    }

    if (roomIds.length === 0) {
      return NextResponse.json({
        teacher: { id: personId ?? uid, name: personName },
        date,
        oversight,
        rooms: [],
      });
    }

    // Load CheckInSettings once (medical_visibility + warning percent).
    const settingsSnap = await churchRef
      .collection("checkinSettings")
      .doc("config")
      .get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : null;
    const visibility = resolveMedicalVisibility(
      settings as Pick<CheckInSettings, "medical_visibility"> | null,
    );
    const warningPercent =
      (settings?.ratio_warning_threshold_percent as number | undefined) ??
      DEFAULT_RATIO_WARNING_PERCENT;

    // Build per-room payloads. Done sequentially because the per-room
    // I/O is small and the typical teacher is in 1-2 rooms.
    const rooms: Array<{
      room: { id: string; name: string };
      children: Array<{
        session_id: string;
        child_id: string;
        child_name: string;
        grade?: string;
        checked_in_at: string;
        has_alerts: boolean;
        allergies?: string;
        medical_notes?: string;
        medications?: string;
        medical_fields: RosterFieldState[];
        parent_phone_masked: string;
        /** Wave 10 (Jason 2026-06-02): parent has signaled arrival
         *  at the kiosk. Render a prominent indicator until ack'd. */
        pickup_ready_at: string | null;
        /** Wave 10 (Jason 2026-06-02): a teacher has ack'd the
         *  pickup ping (clears the prominent indicator). */
        pickup_acknowledged_at: string | null;
        /** Wave 10 (Jason 2026-06-02): user_id of the ack-ing teacher. */
        pickup_acknowledged_by: string | null;
        /** W10 attendance (Jason 2026-06-02): teacher-marked presence. */
        attendance_present: boolean | null;
        attendance_marked_at: string | null;
        attendance_marked_by: string | null;
      }>;
      ratio: ReturnType<typeof evaluateRatio>;
      total_checked_in: number;
    }> = [];

    for (const roomId of roomIds) {
      const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
      if (!roomSnap.exists) continue;
      const room = roomSnap.data() as Room;

      // Children sessions in this room.
      const sessionsSnap = await churchRef
        .collection("checkInSessions")
        .where("service_date", "==", date)
        .where("room_id", "==", roomId)
        .get();
      const activeSessions = sessionsSnap.docs.filter(
        (d) => (d.data().checked_out_at ?? null) === null,
      );

      // Active volunteers in this room (for ratio).
      const volSnap = await churchRef
        .collection("roomVolunteerCheckins")
        .where("room_id", "==", roomId)
        .where("service_date", "==", date)
        .get();
      const activeVolunteers = volSnap.docs
        .map((d) => d.data() as RoomVolunteerCheckIn)
        .filter((v) => (v.checked_out_at ?? null) === null);

      const ratio = evaluateRatio(
        { ratio_policy: room.ratio_policy },
        activeSessions.length,
        activeVolunteers,
        warningPercent,
      );

      const children = await Promise.all(
        activeSessions.map(async (doc) => {
          const session = doc.data() as CheckInSession;
          const child = await loadChild(churchRef, session.child_id);
          const displayName = child?.display_name ?? "Unknown";
          const lastName = child?.last_name ?? "";
          const phone =
            (await loadHouseholdPhone(churchRef, session.household_id)) || "";
          const maskedPhone =
            phone.length >= 4 ? `***${phone.slice(-4)}` : "****";

          const childMedications = (child as { medications?: string } | null)
            ?.medications;
          const snapshot = session.medical_snapshot ?? {
            allergies: child?.allergies ?? null,
            medical_notes: child?.medical_notes ?? null,
            medications: childMedications ?? null,
          };
          const medicalFields = getRosterFieldStates(snapshot, visibility);
          const visibleNoTap = (field: RosterFieldState["field"]) =>
            medicalFields.find(
              (f) => f.field === field && f.visible && !f.requires_tap,
            )?.value ?? undefined;

          // CRITICAL: redact the raw value from any field that isn't
          // immediately renderable. The kiosk roster intentionally
          // ships values for tap-gated fields (the operator taps to
          // reveal client-side; see PR #172 rationale) — but the
          // teacher dashboard has no tap-to-reveal client in v1, so
          // shipping the value would be a real leak. When/if a
          // Bearer-JWT reveal endpoint is added in a follow-up, that
          // endpoint will return the unredacted value alongside the
          // `kiosk.medical_data_revealed` audit emit.
          const safeMedicalFields = medicalFields.map((f) => ({
            ...f,
            value: f.visible && !f.requires_tap ? f.value : null,
          }));

          return {
            session_id: session.id,
            child_id: session.child_id,
            child_name: `${displayName} ${lastName}`.trim(),
            grade: child?.grade,
            checked_in_at: session.checked_in_at,
            has_alerts: child?.has_alerts ?? false,
            allergies: visibleNoTap("allergies") ?? undefined,
            medical_notes: visibleNoTap("medical_notes") ?? undefined,
            medications: visibleNoTap("medications") ?? undefined,
            medical_fields: safeMedicalFields,
            parent_phone_masked: maskedPhone,
            // W10 (Jason 2026-06-02): pickup-ping state flows
            // through to the dashboard so the teacher sees the
            // prominent indicator without an extra fetch.
            pickup_ready_at: session.pickup_ready_at ?? null,
            pickup_acknowledged_at: session.pickup_acknowledged_at ?? null,
            pickup_acknowledged_by: session.pickup_acknowledged_by ?? null,
            attendance_present: session.attendance_present ?? null,
            attendance_marked_at: session.attendance_marked_at ?? null,
            attendance_marked_by: session.attendance_marked_by ?? null,
          };
        }),
      );

      rooms.push({
        room: { id: roomId, name: room.name },
        children: children.sort((a, b) =>
          a.child_name.localeCompare(b.child_name),
        ),
        ratio,
        total_checked_in: children.length,
      });
    }

    // Stable display order — matters most in oversight mode where the
    // list covers every classroom.
    rooms.sort((a, b) => a.room.name.localeCompare(b.room.name));

    // Audit emit (deduped per 5-minute window).
    if (shouldEmitViewAudit(churchId, personId ?? uid, date)) {
      void audit({
        church_id: churchId,
        actor: userActor(uid),
        action: "teacher.dashboard_viewed",
        target_type: "person",
        target_id: personId ?? uid,
        metadata: {
          date,
          oversight,
          room_count: rooms.length,
          children_count: rooms.reduce(
            (a, r) => a + r.total_checked_in,
            0,
          ),
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      teacher: { id: personId ?? uid, name: personName },
      date,
      oversight,
      rooms,
    });
  } catch (error) {
    log.error("[GET /api/teacher/dashboard]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
