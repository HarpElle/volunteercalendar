import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/reservations/requests?church_id=...&status=pending
 * List reservation requests (pending approval queue).
 *
 * Embeds the target reservation, the room name, and the full details of any
 * conflicting reservations directly on each request. Before this change the
 * API returned `requests[]` and `reservations[]` as parallel arrays with no
 * join, so the dashboard rendered every queue card as anonymous
 * "Reservation / Unknown" — admins could not safely decide which row to
 * approve or deny.
 */

interface EmbeddedReservation {
  id: string;
  title: string;
  room_id: string;
  room_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  requested_by_name: string;
  is_recurring: boolean;
  recurrence_group_id: string | null;
  attendee_count: number | null;
  setup_notes: string;
  description: string;
  equipment_requested: string[];
  status: string;
}

interface EmbeddedConflict {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  requested_by_name: string;
}

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

    const rawRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);

    // Gather every reservation ID we'll need (targets + conflicts), then fetch
    // them all in a single batched pass.
    const reservationIds = new Set<string>();
    for (const r of rawRequests) {
      if (r.new_reservation_id) {
        reservationIds.add(r.new_reservation_id as string);
      }
      if (Array.isArray(r.conflicting_reservation_ids)) {
        for (const id of r.conflicting_reservation_ids as string[]) {
          reservationIds.add(id);
        }
      }
    }

    const reservationById = new Map<string, Record<string, unknown>>();
    for (const id of reservationIds) {
      const rSnap = await adminDb
        .doc(`churches/${churchId}/reservations/${id}`)
        .get();
      if (rSnap.exists) {
        reservationById.set(rSnap.id, { id: rSnap.id, ...rSnap.data() });
      }
    }

    // Resolve room names for every distinct room referenced.
    const roomIds = new Set<string>();
    for (const r of reservationById.values()) {
      const rid = r.room_id as string | undefined;
      if (rid) roomIds.add(rid);
    }
    const roomNameById = new Map<string, string>();
    for (const rid of roomIds) {
      const roomSnap = await adminDb
        .doc(`churches/${churchId}/rooms/${rid}`)
        .get();
      if (roomSnap.exists) {
        roomNameById.set(rid, (roomSnap.data()!.name as string) || rid);
      }
    }

    function shapeReservation(r: Record<string, unknown>): EmbeddedReservation {
      const roomId = (r.room_id as string) || "";
      return {
        id: r.id as string,
        title: (r.title as string) || "(untitled)",
        room_id: roomId,
        room_name: roomNameById.get(roomId) || null,
        date: r.date as string,
        start_time: r.start_time as string,
        end_time: r.end_time as string,
        requested_by_name:
          (r.requested_by_name as string) || "Unknown organizer",
        is_recurring: !!r.is_recurring,
        recurrence_group_id: (r.recurrence_group_id as string) || null,
        attendee_count: (r.attendee_count as number) ?? null,
        setup_notes: (r.setup_notes as string) || "",
        description: (r.description as string) || "",
        equipment_requested: (r.equipment_requested as string[]) || [],
        status: (r.status as string) || "",
      };
    }

    const requests = rawRequests
      .map((r) => {
        const targetId = r.new_reservation_id as string | undefined;
        const target = targetId ? reservationById.get(targetId) : null;
        // Defensive orphan filter: drop queue rows whose target reservation
        // is cancelled or denied — those rows are leftovers from previous
        // workflows and admins shouldn't see them.
        if (!target) return null;
        if (
          target.status === "cancelled" ||
          target.status === "denied"
        ) {
          return null;
        }
        const conflicts: EmbeddedConflict[] = [];
        if (Array.isArray(r.conflicting_reservation_ids)) {
          for (const cid of r.conflicting_reservation_ids as string[]) {
            const c = reservationById.get(cid);
            if (!c) continue;
            conflicts.push({
              id: c.id as string,
              title: (c.title as string) || "(untitled)",
              date: c.date as string,
              start_time: c.start_time as string,
              end_time: c.end_time as string,
              requested_by_name:
                (c.requested_by_name as string) || "Unknown",
            });
          }
        }
        return {
          ...r,
          reason:
            (r.reason as string) ||
            (conflicts.length > 0 ? "conflict" : "approval_required"),
          reservation: shapeReservation(target),
          conflicts,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Back-compat: keep `reservations` parallel array for any older client
    // that still reads it. New clients should consume `requests[i].reservation`.
    const reservations = [...reservationById.values()];

    return NextResponse.json({ requests, reservations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
