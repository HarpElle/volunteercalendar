import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { TIER_LIMITS } from "@/lib/constants";
import { randomBytes } from "crypto";
import {
  generateOccurrenceDates,
  materializeRecurringReservation,
} from "@/lib/utils/recurrence";
import type { Reservation, RecurrenceRule, RoomSettings } from "@/lib/types";

async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return decoded.uid;
}

async function getMembership(userId: string, churchId: string) {
  const snap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
  if (!snap.exists) return null;
  return snap.data() as { role: string; display_name?: string };
}

/**
 * Check for time overlaps with existing reservations on the same room + date.
 * Returns array of conflicting reservation IDs.
 */
async function findConflicts(
  churchId: string,
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): Promise<string[]> {
  const snap = await adminDb
    .collection(`churches/${churchId}/reservations`)
    .where("room_id", "==", roomId)
    .where("date", "==", date)
    .get();

  const conflicts: string[] = [];
  for (const doc of snap.docs) {
    if (doc.id === excludeId) continue;
    const r = doc.data();
    if (r.status === "cancelled" || r.status === "denied") continue;
    // Overlap: A_start < B_end && B_start < A_end
    if (startTime < r.end_time && r.start_time < endTime) {
      conflicts.push(doc.id);
    }
  }
  return conflicts;
}

/**
 * Track E.2: same overlap check, but inside a Firestore transaction.
 * The query is performed on a transaction handle so the conflict check and
 * the new reservation write are atomic with respect to other concurrent
 * bookings of the same room+date.
 */
async function findConflictsInTransaction(
  tx: FirebaseFirestore.Transaction,
  churchId: string,
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<string[]> {
  const query = adminDb
    .collection(`churches/${churchId}/reservations`)
    .where("room_id", "==", roomId)
    .where("date", "==", date);
  const snap = await tx.get(query);
  const conflicts: string[] = [];
  for (const doc of snap.docs) {
    const r = doc.data();
    if (r.status === "cancelled" || r.status === "denied") continue;
    if (startTime < r.end_time && r.start_time < endTime) {
      conflicts.push(doc.id);
    }
  }
  return conflicts;
}

/**
 * GET /api/reservations?church_id=...&room_id=...&date_from=...&date_to=...&status=...&ministry_id=...
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const membership = await getMembership(userId, churchId);
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const roomId = req.nextUrl.searchParams.get("room_id");
    const ministryId = req.nextUrl.searchParams.get("ministry_id");
    const status = req.nextUrl.searchParams.get("status");
    const dateFrom =
      req.nextUrl.searchParams.get("date_from") ||
      new Date().toISOString().split("T")[0];
    const dateTo = req.nextUrl.searchParams.get("date_to");

    let query = adminDb
      .collection(`churches/${churchId}/reservations`)
      .where("date", ">=", dateFrom)
      .orderBy("date")
      .orderBy("start_time");

    if (dateTo) {
      query = query.where("date", "<=", dateTo);
    }

    const snap = await query.get();
    let reservations = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Reservation,
    );

    // Client-side filters (Firestore limits compound queries)
    if (roomId) {
      reservations = reservations.filter((r) => r.room_id === roomId);
    }
    if (ministryId) {
      reservations = reservations.filter((r) => r.ministry_id === ministryId);
    }
    if (status && status !== "all") {
      reservations = reservations.filter((r) => r.status === status);
    } else if (!status) {
      // Default: confirmed + pending_approval
      reservations = reservations.filter(
        (r) => r.status === "confirmed" || r.status === "pending_approval",
      );
    }

    return NextResponse.json({ reservations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reservations
 * Create a reservation. Any authenticated member can reserve.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { church_id, room_id, title, date, start_time, end_time } = body;

    if (!church_id || !room_id || !title?.trim() || !date || !start_time || !end_time) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, room_id, title, date, start_time, end_time" },
        { status: 400 },
      );
    }

    if (start_time >= end_time) {
      return NextResponse.json(
        { error: "start_time must be before end_time" },
        { status: 400 },
      );
    }

    const membership = await getMembership(userId, church_id);
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Verify room exists
    const roomSnap = await adminDb
      .doc(`churches/${church_id}/rooms/${room_id}`)
      .get();
    if (!roomSnap.exists || !roomSnap.data()!.is_active) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Load settings
    const settingsSnap = await adminDb
      .doc(`churches/${church_id}/roomSettings/config`)
      .get();
    const settings = (settingsSnap.data() || {}) as Partial<RoomSettings>;
    const requireApproval = settings.require_approval ?? false;

    // Handle recurrence
    const recurrenceRule = body.recurrence_rule as RecurrenceRule | undefined;
    const isRecurring = !!recurrenceRule;

    if (isRecurring) {
      // Check tier
      const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
      const tier = (churchSnap.data()?.subscription_tier || "free") as string;
      if (!TIER_LIMITS[tier]?.rooms_recurring) {
        return NextResponse.json(
          { error: "Recurring reservations require Growth tier or higher" },
          { status: 403 },
        );
      }
    }

    const now = new Date().toISOString();
    const requesterName =
      membership.display_name || body.requested_by_name || "Unknown";
    const groupId = isRecurring ? randomBytes(8).toString("hex") : undefined;

    // Single reservations — wrapped in a Firestore transaction so the conflict
    // check + write are atomic. Eliminates the race where two concurrent
    // bookings can both pass conflict-check and both succeed (Track E.2).
    if (!isRecurring) {
      const docRef = adminDb
        .collection(`churches/${church_id}/reservations`)
        .doc();
      const requestRef = adminDb
        .collection(`churches/${church_id}/reservation_requests`)
        .doc();

      const result = await adminDb.runTransaction(async (tx) => {
        const conflicts = await findConflictsInTransaction(
          tx,
          church_id,
          room_id,
          date,
          start_time,
          end_time,
        );
        const hasConflict = conflicts.length > 0;
        const status =
          hasConflict || requireApproval ? "pending_approval" : "confirmed";

        const reservation: Reservation = {
          id: docRef.id,
          church_id,
          room_id,
          title: title.trim(),
          description: body.description?.trim() || "",
          ministry_id: body.ministry_id || null,
          requested_by: userId,
          requested_by_name: requesterName,
          date,
          start_time,
          end_time,
          status,
          equipment_requested: body.equipment_requested || [],
          teams_needed: body.teams_needed || [],
          attendee_count: body.attendee_count || null,
          setup_notes: body.setup_notes?.trim() || "",
          is_recurring: false,
          conflict_with_ids: conflicts,
          created_at: now,
          updated_at: now,
        };
        tx.set(docRef, reservation);

        if (status === "pending_approval" && hasConflict) {
          tx.set(requestRef, {
            id: requestRef.id,
            church_id,
            new_reservation_id: docRef.id,
            conflicting_reservation_ids: conflicts,
            status: "pending",
            created_at: now,
          });
        }

        return { reservation, hasConflict };
      });

      return NextResponse.json(
        { reservation: result.reservation, has_conflict: result.hasConflict },
        { status: 201 },
      );
    }

    // For recurring reservations
    const dates = generateOccurrenceDates(date, recurrenceRule!);
    if (dates.length === 0) {
      return NextResponse.json(
        { error: "Recurrence rule generated no dates" },
        { status: 400 },
      );
    }

    // Check conflicts across all dates
    const allConflicts: string[] = [];
    for (const d of dates) {
      const c = await findConflicts(church_id, room_id, d, start_time, end_time);
      allConflicts.push(...c);
    }
    const hasConflict = allConflicts.length > 0;
    const status =
      hasConflict || requireApproval ? "pending_approval" : "confirmed";

    const baseReservation = {
      church_id,
      room_id,
      title: title.trim(),
      description: body.description?.trim() || "",
      ministry_id: body.ministry_id || null,
      requested_by: userId,
      requested_by_name: requesterName,
      start_time,
      end_time,
      status,
      equipment_requested: body.equipment_requested || [],
      teams_needed: body.teams_needed || [],
      attendee_count: body.attendee_count || null,
      setup_notes: body.setup_notes?.trim() || "",
      is_recurring: true,
      recurrence_rule: recurrenceRule,
      recurrence_group_id: groupId,
      conflict_with_ids: [],
      created_at: now,
      updated_at: now,
    } as Omit<Reservation, "id" | "date" | "recurrence_index">;

    const ids = await materializeRecurringReservation(
      baseReservation,
      dates,
      adminDb,
      church_id,
    );

    return NextResponse.json(
      {
        reservation_ids: ids,
        occurrence_count: ids.length,
        recurrence_group_id: groupId,
        has_conflict: hasConflict,
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
