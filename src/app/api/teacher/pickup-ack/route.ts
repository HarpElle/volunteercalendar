/**
 * POST /api/teacher/pickup-ack
 *
 * Wave 10 (Jason 2026-06-02). Teacher acknowledges a parent's
 * pickup-ready ping from their classroom dashboard. Flips the row
 * state so other teachers / admins know it's being handled (beats
 * KidCheck on queue handling).
 *
 * Auth: Bearer + caller must be checked into the same room as the
 * session being acked (same gate as /api/teacher/page-parent).
 * Body: { church_id, session_id }
 * Response: { ok: true, acknowledged_at }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { audit, userActor } from "@/lib/server/audit";
import { hasClassroomOversight } from "@/lib/server/classroom-oversight";
import type { CheckInSession, RoomVolunteerCheckIn } from "@/lib/types";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const body = (await req.json()) as {
      church_id?: string;
      session_id?: string;
    };
    const churchId = body.church_id;
    const sessionId = body.session_id;
    if (!churchId || !sessionId) {
      return NextResponse.json(
        { error: "Missing church_id or session_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    const sessionSnap = await churchRef
      .collection("checkInSessions")
      .doc(sessionId)
      .get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionSnap.data() as CheckInSession;

    // Same-room gate — bypassed for classroom oversight
    // (owner/admin/checkin_manager flag).
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
              "You must be checked into this room to acknowledge a pickup",
          },
          { status: 403 },
        );
      }
    }

    const nowIso = new Date().toISOString();
    await sessionSnap.ref.update({
      pickup_acknowledged_at: nowIso,
      pickup_acknowledged_by: uid,
    });

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "teacher.pickup_acknowledged",
      target_type: "checkin_session",
      target_id: sessionId,
      metadata: {
        room_id: session.room_id,
        child_id: session.child_id,
        oversight,
      },
      outcome: "ok",
    });

    return NextResponse.json({ ok: true, acknowledged_at: nowIso });
  } catch (err) {
    console.error("[POST /api/teacher/pickup-ack]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
