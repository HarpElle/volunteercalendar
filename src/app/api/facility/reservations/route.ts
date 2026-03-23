import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/facility/reservations
 *
 * Returns reservations from linked organizations in the same facility group
 * for a given room's facility_group_id and date range.
 *
 * Query params:
 *   church_id       — requesting org
 *   facility_group_id — the facility group to query
 *   date            — ISO date string (YYYY-MM-DD)
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

    if (!churchId || !facilityGroupId || !date) {
      return NextResponse.json(
        { error: "Missing church_id, facility_group_id, or date" },
        { status: 400 },
      );
    }

    // Verify user is a member of the requesting org
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb
      .doc(`memberships/${membershipId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Verify requesting org is an active member of this facility group
    const ownMemberSnap = await adminDb
      .doc(`facility_groups/${facilityGroupId}/members/${churchId}`)
      .get();
    if (!ownMemberSnap.exists || ownMemberSnap.data()?.status !== "active") {
      return NextResponse.json(
        { error: "Not a member of this facility group" },
        { status: 403 },
      );
    }

    // Get all active members of the facility group (excluding requesting org)
    const membersSnap = await adminDb
      .collection(`facility_groups/${facilityGroupId}/members`)
      .where("status", "==", "active")
      .get();

    const linkedChurchIds = membersSnap.docs
      .map((d) => d.id)
      .filter((id) => id !== churchId);

    if (linkedChurchIds.length === 0) {
      return NextResponse.json({ reservations: [] });
    }

    // Fetch reservations from each linked org for the given date
    const allReservations: Array<{
      id: string;
      church_id: string;
      church_name: string;
      room_id: string;
      room_name: string;
      title: string;
      date: string;
      start_time: string;
      end_time: string;
    }> = [];

    for (const linkedChurchId of linkedChurchIds) {
      const memberData = membersSnap.docs.find(
        (d) => d.id === linkedChurchId,
      )?.data();
      const churchName = memberData?.church_name || "Unknown";

      // Find rooms in this church that are part of the facility group
      const roomsSnap = await adminDb
        .collection(`churches/${linkedChurchId}/rooms`)
        .where("facility_group_id", "==", facilityGroupId)
        .where("is_active", "==", true)
        .get();

      for (const roomDoc of roomsSnap.docs) {
        const roomData = roomDoc.data();

        // Fetch reservations for this room on the given date
        const reservationsSnap = await adminDb
          .collection(`churches/${linkedChurchId}/reservations`)
          .where("room_id", "==", roomDoc.id)
          .where("date", "==", date)
          .where("status", "in", ["confirmed", "pending_approval"])
          .get();

        for (const resDoc of reservationsSnap.docs) {
          const resData = resDoc.data();
          allReservations.push({
            id: resDoc.id,
            church_id: linkedChurchId,
            church_name: churchName,
            room_id: roomDoc.id,
            room_name: roomData.name || "Room",
            title: resData.title || "Reserved",
            date: resData.date,
            start_time: resData.start_time,
            end_time: resData.end_time,
          });
        }
      }
    }

    return NextResponse.json({ reservations: allReservations });
  } catch (err) {
    console.error("Facility reservations error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
