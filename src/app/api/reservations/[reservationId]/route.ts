import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { cancelRecurrenceGroup } from "@/lib/utils/recurrence";

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

/**
 * GET /api/reservations/[reservationId]?church_id=...
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reservationId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, churchId);
    if (!role) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const snap = await adminDb
      .doc(`churches/${churchId}/reservations/${reservationId}`)
      .get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      reservation: { id: snap.id, ...snap.data() },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/reservations/[reservationId]
 * Update a reservation. Requester can edit their own; admin can edit any.
 * For recurring: accepts edit_scope ("single_date" | "from_date" | "all").
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reservationId } = await params;
    const body = await req.json();
    const { church_id, edit_scope } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, church_id);
    if (!role) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const ref = adminDb.doc(
      `churches/${church_id}/reservations/${reservationId}`,
    );
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    const existing = snap.data()!;
    // Permission: requester can edit own, admin can edit any
    if (
      existing.requested_by !== userId &&
      !["owner", "admin"].includes(role)
    ) {
      return NextResponse.json(
        { error: "Cannot edit another user's reservation" },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const IMMUTABLE = [
      "id",
      "church_id",
      "created_at",
      "requested_by",
      "edit_scope",
    ];
    const updates: Record<string, unknown> = { updated_at: now };

    for (const [key, value] of Object.entries(body)) {
      if (key === "church_id" || IMMUTABLE.includes(key)) continue;
      updates[key] = value;
    }

    // Single update
    if (
      !existing.is_recurring ||
      !edit_scope ||
      edit_scope === "single_date"
    ) {
      await ref.update(updates);
      const updated = await ref.get();
      return NextResponse.json({
        reservation: { id: updated.id, ...updated.data() },
        affected_count: 1,
      });
    }

    // Recurring: update all or from_date
    const groupId = existing.recurrence_group_id;
    if (!groupId) {
      await ref.update(updates);
      const updated = await ref.get();
      return NextResponse.json({
        reservation: { id: updated.id, ...updated.data() },
        affected_count: 1,
      });
    }

    let query = adminDb
      .collection(`churches/${church_id}/reservations`)
      .where("recurrence_group_id", "==", groupId);

    if (edit_scope === "from_date") {
      query = query.where("date", ">=", existing.date);
    }

    const groupSnap = await query.get();
    const batch = adminDb.batch();
    for (const doc of groupSnap.docs) {
      batch.update(doc.ref, updates);
    }
    await batch.commit();

    return NextResponse.json({
      reservation: { id: snap.id, ...existing, ...updates },
      affected_count: groupSnap.size,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/reservations/[reservationId]?church_id=...&edit_scope=...
 * Cancel a reservation (soft delete).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reservationId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    const editScope =
      (req.nextUrl.searchParams.get("edit_scope") as
        | "single"
        | "from_date"
        | "all") || "single";
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, churchId);
    if (!role) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const ref = adminDb.doc(
      `churches/${churchId}/reservations/${reservationId}`,
    );
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    const existing = snap.data()!;
    if (
      existing.requested_by !== userId &&
      !["owner", "admin"].includes(role)
    ) {
      return NextResponse.json(
        { error: "Cannot cancel another user's reservation" },
        { status: 403 },
      );
    }

    // Non-recurring or single cancel
    if (!existing.is_recurring || !existing.recurrence_group_id || editScope === "single") {
      await ref.update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ cancelled_count: 1 });
    }

    // Recurring cancel
    const cancelled = await cancelRecurrenceGroup(
      adminDb,
      churchId,
      existing.recurrence_group_id,
      editScope,
      editScope === "from_date" ? existing.date : undefined,
    );

    return NextResponse.json({ cancelled_count: cancelled });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
