import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";

/**
 * POST /api/checkin/room-checkout
 * Teacher checkout — authenticated via room token (same as room view).
 * No security code required (teacher is authorized via the room token).
 * Body: { church_id, room_id, token, session_id }
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { church_id, room_id, token, session_id } = body as {
      church_id: string;
      room_id: string;
      token: string;
      session_id: string;
    };

    if (!church_id || !room_id || !token || !session_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Verify room token
    const roomSnap = await churchRef
      .collection("checkinRooms")
      .doc(room_id)
      .get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = roomSnap.data()!;
    if (room.checkin_view_token !== token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Verify session belongs to this room
    const sessionRef = churchRef.collection("checkInSessions").doc(session_id);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    const session = sessionSnap.data()!;
    if (session.room_id !== room_id) {
      return NextResponse.json(
        { error: "Session does not belong to this room" },
        { status: 403 },
      );
    }

    if (session.checked_out_at) {
      return NextResponse.json(
        { error: "Already checked out" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    await sessionRef.update({
      checked_out_at: now,
      checked_out_by_user_id: "room_teacher",
    });

    return NextResponse.json({
      success: true,
      checked_out_at: now,
    });
  } catch (error) {
    console.error("[POST /api/checkin/room-checkout]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
