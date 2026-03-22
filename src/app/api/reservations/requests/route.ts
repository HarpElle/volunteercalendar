import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/reservations/requests?church_id=...&status=pending
 * List reservation requests (pending approval queue).
 * Eager-loads related Reservation documents.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const memberSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
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

    const statusFilter =
      req.nextUrl.searchParams.get("status") || "pending";

    const snap = await adminDb
      .collection(`churches/${churchId}/reservation_requests`)
      .where("status", "==", statusFilter)
      .orderBy("created_at", "desc")
      .get();

    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Eager-load related reservations
    const reservationIds = new Set<string>();
    for (const r of requests) {
      const data = r as Record<string, unknown>;
      if (data.new_reservation_id)
        reservationIds.add(data.new_reservation_id as string);
      if (Array.isArray(data.conflicting_reservation_ids)) {
        for (const id of data.conflicting_reservation_ids as string[]) {
          reservationIds.add(id);
        }
      }
    }

    const reservations: Record<string, unknown>[] = [];
    for (const id of reservationIds) {
      const rSnap = await adminDb
        .doc(`churches/${churchId}/reservations/${id}`)
        .get();
      if (rSnap.exists) {
        reservations.push({ id: rSnap.id, ...rSnap.data() });
      }
    }

    return NextResponse.json({ requests, reservations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
