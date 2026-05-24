import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";

/** Fields that must never be overwritten via PATCH. */
const IMMUTABLE_FIELDS = new Set([
  "id",
  "church_id",
  "created_at",
  "date_added",
]);

/**
 * PATCH /api/songs/{id}
 * Update a song's mutable fields.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireModuleTier(req, "worship", { churchIdFrom: "body" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;
    const { id: songId } = await params;

    const body = await req.json();

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Verify the song exists
    const songRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("songs")
      .doc(songId);
    const songSnap = await songRef.get();
    if (!songSnap.exists) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    // Build safe update payload
    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!IMMUTABLE_FIELDS.has(key)) {
        updateFields[key] = value;
      }
    }
    updateFields.updated_by = userId;

    await songRef.update(updateFields);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/songs/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/songs/{id}
 * Soft-delete (archive) a song.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;
    const { id: songId } = await params;

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Verify the song exists
    const songRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("songs")
      .doc(songId);
    const songSnap = await songRef.get();
    if (!songSnap.exists) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    // Soft delete: set status to archived
    await songRef.update({
      status: "archived",
      updated_by: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/songs/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
