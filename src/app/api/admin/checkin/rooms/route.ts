import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";

/**
 * GET /api/admin/checkin/rooms?church_id=...
 * List all rooms for a church.
 *
 * PUT /api/admin/checkin/rooms
 * Update check-in fields on a room (grades, capacity, overflow).
 */

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return { userId: decoded.uid };
}

async function checkRole(userId: string, churchId: string) {
  const snap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
  if (!snap.exists) return false;
  const role = snap.data()!.role as string;
  return ["owner", "admin", "scheduler"].includes(role);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdmin(req);
    if ("error" in auth) return auth.error;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    if (!(await checkRole(auth.userId, churchId))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const snap = await adminDb
      .collection(`churches/${churchId}/rooms`)
      .orderBy("name")
      .get();

    const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ rooms });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const { church_id, room_id, default_grades, capacity, overflow_room_id } = body;

    if (!church_id || !room_id) {
      return NextResponse.json(
        { error: "Missing church_id or room_id" },
        { status: 400 },
      );
    }

    if (!(await checkRole(auth.userId, church_id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const roomRef = adminDb.doc(`churches/${church_id}/rooms/${room_id}`);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (default_grades !== undefined) updates.default_grades = default_grades;
    if (capacity !== undefined) updates.capacity = capacity;
    if (overflow_room_id !== undefined) updates.overflow_room_id = overflow_room_id;

    // Generate checkin_view_token if room gets grades assigned and doesn't have one
    const existing = roomSnap.data()!;
    if (
      default_grades?.length > 0 &&
      !existing.checkin_view_token
    ) {
      updates.checkin_view_token = randomBytes(16).toString("hex");
    }

    await roomRef.update(updates);

    const updated = await roomRef.get();
    return NextResponse.json({ room: { id: updated.id, ...updated.data() } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
