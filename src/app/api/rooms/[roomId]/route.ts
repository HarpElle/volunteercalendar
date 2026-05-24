import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";

const IMMUTABLE_FIELDS = ["id", "church_id", "created_at", "created_by"];

/**
 * GET /api/rooms/[roomId]?church_id=...
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const gate = await requireModuleTier(req, "rooms");
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;

    const { roomId } = await params;

    const snap = await adminDb
      .doc(`churches/${churchId}/rooms/${roomId}`)
      .get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({ room: { id: snap.id, ...snap.data() } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/rooms/[roomId]
 * Update a room. Requires admin role.
 */
export async function PUT(
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
    const body = await req.json();

    const ref = adminDb.doc(`churches/${churchId}/rooms/${roomId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(body)) {
      if (key === "church_id") continue;
      if (IMMUTABLE_FIELDS.includes(key)) continue;
      updates[key] = value;
    }

    await ref.update(updates);
    const updated = await ref.get();
    return NextResponse.json({ room: { id: updated.id, ...updated.data() } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/rooms/[roomId]?church_id=...
 * Soft-delete a room (sets is_active: false).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const gate = await requireModuleTier(req, "rooms");
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

    await ref.update({
      is_active: false,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
