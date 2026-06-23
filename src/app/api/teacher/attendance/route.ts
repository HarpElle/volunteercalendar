/**
 * POST /api/teacher/attendance
 *
 * Wave 10 (Jason 2026-06-02). Teacher marks an individual child's
 * attendance in their classroom (present / not_in_room / clear).
 * Surfaces on the emergency / first-responder roster so EMTs and
 * the evacuation marshal don't waste time searching for a child
 * who isn't actually in the room.
 *
 * Auth: Bearer + caller must be checked into the same room as the
 * session being marked (same gate as /api/teacher/page-parent and
 * /api/teacher/pickup-ack).
 *
 * Body: { church_id, session_id, present }
 *   - present: true  → confirmed in room
 *   - present: false → reported NOT in room (despite being checked in)
 *   - present: null  → clear the mark
 *
 * Response: { ok: true, marked_at, present }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { audit, userActor } from "@/lib/server/audit";
import { hasClassroomOversight } from "@/lib/server/classroom-oversight";
import type { CheckInSession, RoomVolunteerCheckIn } from "@/lib/types";

interface PostBody {
  church_id?: string;
  session_id?: string;
  present?: boolean | null;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const body = (await req.json()) as PostBody;
    const churchId = body.church_id;
    const sessionId = body.session_id;
    // `present` is intentionally three-valued (true / false / null).
    // We accept undefined as "no change" but null as "clear the mark"
    // — distinguish in the type check.
    if (!churchId || !sessionId) {
      return NextResponse.json(
        { error: "Missing church_id or session_id" },
        { status: 400 },
      );
    }
    if (body.present !== true && body.present !== false && body.present !== null) {
      return NextResponse.json(
        { error: "present must be true, false, or null" },
        { status: 400 },
      );
    }
    const present = body.present;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Load session.
    const sessionSnap = await churchRef
      .collection("checkInSessions")
      .doc(sessionId)
      .get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionSnap.data() as CheckInSession;

    // Caller must be checked into the same room (mirrors
    // /api/teacher/pickup-ack's gate) — unless they carry classroom
    // oversight (owner/admin/checkin_manager flag).
    const oversight = await hasClassroomOversight(churchId, uid);
    if (!oversight) {
      const peopleSnap = await churchRef
        .collection("people")
        .where("user_id", "==", uid)
        .limit(1)
        .get();
      if (peopleSnap.empty) {
        return NextResponse.json(
          { error: "Not a member of this church" },
          { status: 403 },
        );
      }
      const callerPersonId = peopleSnap.docs[0].id;

      const today = new Date().toISOString().split("T")[0];
      const volSnap = await churchRef
        .collection("roomVolunteerCheckins")
        .where("person_id", "==", callerPersonId)
        .where("room_id", "==", session.room_id)
        .where("service_date", "==", today)
        .get();
      const activeRoomCheckin = volSnap.docs
        .map((d) => d.data() as RoomVolunteerCheckIn)
        .find((v) => !v.checked_out_at);
      if (!activeRoomCheckin) {
        return NextResponse.json(
          {
            error:
              "You must be checked into this room to mark attendance",
          },
          { status: 403 },
        );
      }
    }

    const nowIso = new Date().toISOString();
    await sessionSnap.ref.update({
      attendance_present: present,
      attendance_marked_at: present === null ? null : nowIso,
      attendance_marked_by: present === null ? null : uid,
    });

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "teacher.attendance_marked",
      target_type: "checkin_session",
      target_id: sessionId,
      metadata: {
        room_id: session.room_id,
        child_id: session.child_id,
        oversight,
        // Stringify so the audit metadata stays primitive-only.
        present:
          present === true ? "present" : present === false ? "not_in_room" : "cleared",
      },
      outcome: "ok",
    });

    return NextResponse.json({
      ok: true,
      marked_at: present === null ? null : nowIso,
      present,
    });
  } catch (err) {
    console.error("[POST /api/teacher/attendance]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
