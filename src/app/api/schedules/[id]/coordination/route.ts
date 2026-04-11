import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Schedule, Assignment, Person } from "@/lib/types";

interface SharedVolunteer {
  volunteer_id: string;
  volunteer_name: string;
  assignments: {
    ministry_id: string;
    role_title: string;
    service_date: string;
    service_id: string;
  }[];
}

/**
 * GET /api/schedules/{id}/coordination
 *
 * Returns shared volunteer analysis: volunteers assigned to 2+ ministries
 * within this schedule's date range. Used for cross-team coordination.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { id: scheduleId } = await params;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(churchId);
    const [scheduleSnap, assignSnap, volSnap] = await Promise.all([
      churchRef.collection("schedules").doc(scheduleId).get(),
      churchRef
        .collection("assignments")
        .where("schedule_id", "==", scheduleId)
        .where("status", "in", ["draft", "confirmed"])
        .get(),
      churchRef.collection("people").get(),
    ]);

    if (!scheduleSnap.exists) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const _schedule = { id: scheduleSnap.id, ...scheduleSnap.data()! } as Schedule;

    const volunteersMap = new Map<string, Person>();
    volSnap.docs.forEach((d) => {
      volunteersMap.set(d.id, { id: d.id, ...d.data() } as Person);
    });

    // Group assignments by volunteer
    const byVolunteer = new Map<string, Assignment[]>();
    for (const doc of assignSnap.docs) {
      const assignment = { id: doc.id, ...doc.data() } as Assignment;
      const key = assignment.person_id as string;
      const existing = byVolunteer.get(key) || [];
      existing.push(assignment);
      byVolunteer.set(key, existing);
    }

    // Find volunteers assigned to 2+ different ministries
    const sharedVolunteers: SharedVolunteer[] = [];
    for (const [volId, assignments] of byVolunteer) {
      const ministryIds = new Set(assignments.map((a) => a.ministry_id));
      if (ministryIds.size >= 2) {
        const volunteer = volunteersMap.get(volId);
        sharedVolunteers.push({
          volunteer_id: volId,
          volunteer_name: volunteer?.name || "Unknown",
          assignments: assignments.map((a) => ({
            ministry_id: a.ministry_id,
            role_title: a.role_title,
            service_date: a.service_date,
            service_id: a.service_id || "",
          })),
        });
      }
    }

    // Also find same-date conflicts (same volunteer, different ministries, same date)
    const dateConflicts: {
      volunteer_id: string;
      volunteer_name: string;
      date: string;
      ministries: string[];
    }[] = [];

    for (const sv of sharedVolunteers) {
      const byDate = new Map<string, Set<string>>();
      for (const a of sv.assignments) {
        const existing = byDate.get(a.service_date) || new Set();
        existing.add(a.ministry_id);
        byDate.set(a.service_date, existing);
      }
      for (const [date, ministries] of byDate) {
        if (ministries.size >= 2) {
          dateConflicts.push({
            volunteer_id: sv.volunteer_id,
            volunteer_name: sv.volunteer_name,
            date,
            ministries: Array.from(ministries),
          });
        }
      }
    }

    return NextResponse.json({
      shared_volunteers: sharedVolunteers,
      date_conflicts: dateConflicts,
      total_shared: sharedVolunteers.length,
      total_date_conflicts: dateConflicts.length,
    });
  } catch (error) {
    console.error("[GET /api/schedules/[id]/coordination]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
