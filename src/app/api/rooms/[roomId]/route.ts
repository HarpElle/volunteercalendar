import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return decoded.uid;
}

async function getMembershipRole(userId: string, churchId: string) {
  const snap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
  if (!snap.exists) return null;
  return snap.data()!.role as string;
}

const IMMUTABLE_FIELDS = ["id", "church_id", "created_at", "created_by"];

/**
 * GET /api/rooms/[roomId]?church_id=...
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roomId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, churchId);
    if (!role) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

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
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roomId } = await params;
    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, church_id);
    if (!role || !["owner", "admin"].includes(role)) {
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
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roomId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, churchId);
    if (!role || !["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

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
