import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import type { SongArrangement } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/arrangements/[id]
 * Update an arrangement's fields.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const gate = await requireModuleTier(req, "worship", {
      churchIdFrom: "body",
    });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;
    const { id } = await params;

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { ...updates } = body;

    const docRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("arrangements")
      .doc(id);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Arrangement not found" }, { status: 404 });
    }

    // If setting as default, unset others
    if (updates.is_default === true) {
      const songId = (docSnap.data() as SongArrangement).song_id;
      const otherSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("arrangements")
        .where("song_id", "==", songId)
        .where("is_default", "==", true)
        .get();

      const batch = adminDb.batch();
      for (const doc of otherSnap.docs) {
        if (doc.id !== id) {
          batch.update(doc.ref, { is_default: false });
        }
      }
      await batch.commit();
    }

    // Remove protected fields from updates
    delete updates.id;
    delete updates.song_id;
    delete updates.church_id;
    delete updates.created_at;

    updates.updated_by = userId;

    await docRef.update(updates);

    const updated = await docRef.get();
    const arrangement: SongArrangement = { id: updated.id, ...updated.data() } as SongArrangement;

    return NextResponse.json(arrangement);
  } catch (error) {
    console.error("[PATCH /api/arrangements/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/arrangements/[id]?church_id=xxx
 * Delete an arrangement.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { churchId, role } = gate.ctx;
    const { id } = await params;

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const docRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("arrangements")
      .doc(id);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Arrangement not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/arrangements/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
