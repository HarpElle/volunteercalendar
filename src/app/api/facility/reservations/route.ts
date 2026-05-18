import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/facility/reservations?church_id=...&facility_group_id=...&date=...
 *   OR
 * GET /api/facility/reservations?church_id=...&facility_group_id=...
 *     &date_from=...&date_to=...
 *
 * Returns rooms + reservations from the OTHER orgs in a facility group
 * (everyone except the requesting org). Used by the shared facility calendar
 * view at /dashboard/rooms/facility/[groupId].
 *
 * Auth: requester must be an active member of the requesting org AND the
 * requesting org must be an active member of the facility group.
 *
 * Date param: pass either `date` (single day) or `date_from` + `date_to`
 * (inclusive range). The range form was added in PR #26 so the cross-org
 * calendar can fetch a whole week in one call.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get("church_id");
    const facilityGroupId = searchParams.get("facility_group_id");
    const date = searchParams.get("date");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    if (!churchId || !facilityGroupId) {
      return NextResponse.json(
        { error: "Missing church_id or facility_group_id" },
        { status: 400 },
      );
    }
    if (!date && !(dateFrom && dateTo)) {
      return NextResponse.json(
        { error: "Missing date or (date_from + date_to)" },
        { status: 400 },
      );
    }

    // Verify user is a member of the requesting org
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Verify requesting org is an active member of the facility group
    const ownMemberSnap = await adminDb
      .doc(`facility_groups/${facilityGroupId}/members/${churchId}`)
      .get();
    if (!ownMemberSnap.exists || ownMemberSnap.data()?.status !== "active") {
      return NextResponse.json(
        { error: "Not a member of this facility group" },
        { status: 403 },
      );
    }

    // All active member orgs (excluding requesting org)
    const membersSnap = await adminDb
      .collection(`facility_groups/${facilityGroupId}/members`)
      .where("status", "==", "active")
      .get();
    const linkedChurchIds = membersSnap.docs
      .map((d) => d.id)
      .filter((id) => id !== churchId);

    if (linkedChurchIds.length === 0) {
      return NextResponse.json({ rooms: [], reservations: [] });
    }

    interface SharedRoom {
      id: string;
      name: string;
      capacity?: number;
      church_id: string;
      church_name: string;
    }
    interface SharedReservation {
      id: string;
      church_id: string;
      church_name: string;
      room_id: string;
      room_name: string;
      title: string;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
    }
    const allRooms: SharedRoom[] = [];
    const allReservations: SharedReservation[] = [];

    for (const linkedChurchId of linkedChurchIds) {
      const memberData = membersSnap.docs.find(
        (d) => d.id === linkedChurchId,
      )?.data();
      const churchName = (memberData?.church_name as string) || "Unknown";

      // Rooms in this linked org tagged with this facility group
      const roomsSnap = await adminDb
        .collection(`churches/${linkedChurchId}/rooms`)
        .where("facility_group_id", "==", facilityGroupId)
        .where("is_active", "==", true)
        .get();

      for (const roomDoc of roomsSnap.docs) {
        const roomData = roomDoc.data();
        const roomName = (roomData.name as string) || "Room";
        allRooms.push({
          id: roomDoc.id,
          name: roomName,
          capacity: roomData.capacity as number | undefined,
          church_id: linkedChurchId,
          church_name: churchName,
        });

        // Reservations for this room
        let resvQuery = adminDb
          .collection(`churches/${linkedChurchId}/reservations`)
          .where("room_id", "==", roomDoc.id)
          .where("status", "in", ["confirmed", "pending_approval"]);

        if (date) {
          resvQuery = resvQuery.where("date", "==", date);
        } else {
          // dateFrom + dateTo (validated above)
          resvQuery = resvQuery
            .where("date", ">=", dateFrom!)
            .where("date", "<=", dateTo!);
        }

        const reservationsSnap = await resvQuery.get();
        for (const resDoc of reservationsSnap.docs) {
          const resData = resDoc.data();
          allReservations.push({
            id: resDoc.id,
            church_id: linkedChurchId,
            church_name: churchName,
            room_id: roomDoc.id,
            room_name: roomName,
            title: (resData.title as string) || "Reserved",
            date: resData.date as string,
            start_time: resData.start_time as string,
            end_time: resData.end_time as string,
            status: (resData.status as string) || "confirmed",
          });
        }
      }
    }

    return NextResponse.json({
      rooms: allRooms,
      reservations: allReservations,
    });
  } catch (err) {
    console.error("Facility reservations error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
