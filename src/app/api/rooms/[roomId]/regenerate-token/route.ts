import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";

/**
 * POST /api/rooms/[roomId]/regenerate-token
 * Generate a new calendar_token for a room. Requires admin role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { roomId } = await params;
    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const memberSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = memberSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const ref = adminDb.doc(`churches/${church_id}/rooms/${roomId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const newToken = randomBytes(16).toString("hex");
    await ref.update({
      calendar_token: newToken,
      updated_at: new Date().toISOString(),
    });

    const updated = await ref.get();
    return NextResponse.json({ room: { id: updated.id, ...updated.data() } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
