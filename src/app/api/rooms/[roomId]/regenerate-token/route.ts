import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import { requireModuleTier } from "@/lib/server/require-module-tier";

/**
 * POST /api/rooms/[roomId]/regenerate-token
 * Generate a new calendar_token for a room. Requires admin role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const gate = await requireModuleTier(req, "rooms", {
      churchIdFrom: "body",
    });
    if (!gate.ok) return gate.response;
    const { churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { roomId } = await params;

    const ref = adminDb.doc(`churches/${churchId}/rooms/${roomId}`);
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
