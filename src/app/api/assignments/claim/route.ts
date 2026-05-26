import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  canServeInMinistry,
  hasCompletedPrerequisites,
  normalizeWorkflowMode,
} from "@/lib/services/scheduler";
import { getServiceMinistries } from "@/lib/utils/service-helpers";
import type {
  Schedule,
  Service,
  Person,
  Ministry,
  Assignment,
  Church,
} from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import { createUserNotification } from "@/lib/services/user-notifications";

interface ClaimBody {
  church_id: string;
  schedule_id: string;
  service_id: string;
  service_date: string; // YYYY-MM-DD
  role_id: string;
  ministry_id: string;
}

/**
 * POST /api/assignments/claim
 *
 * A volunteer claims one open slot on a Self-Service schedule. Race-safe
 * via Firestore transaction:
 *
 *   1. Read schedule → must exist, be self-service, in draft/in_review.
 *   2. Read service → role must exist; record its count.
 *   3. Read existing assignments for (schedule, service, date, role) → must
 *      have room left + caller must not already be on this slot.
 *   4. Eligibility check (canServeInMinistry + hasCompletedPrerequisites)
 *      against the volunteer doc + ministry + org prereqs.
 *   5. Write new Assignment with signup_type "self_signup",
 *      status "confirmed" (the volunteer's act of clicking IS the
 *      confirmation).
 *
 * Auth: any active member of the church. The volunteer must have a Person
 * record linked to their user_id; we resolve the person via the people
 * subcollection rather than trusting the client.
 *
 * Phase 6 follow-up #3 (2026-05-18).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const callerUid = decoded.uid;

    const body = (await req.json()) as ClaimBody;
    const { church_id, schedule_id, service_id, service_date, role_id, ministry_id } = body;

    if (!church_id || !schedule_id || !service_id || !service_date || !role_id || !ministry_id) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, schedule_id, service_id, service_date, role_id, ministry_id" },
        { status: 400 },
      );
    }

    // Verify membership (any active member, including plain volunteers).
    const memSnap = await adminDb.doc(`memberships/${callerUid}_${church_id}`).get();
    if (!memSnap.exists || memSnap.data()?.status !== "active") {
      return NextResponse.json({ error: "Not an active member" }, { status: 403 });
    }

    // Resolve the caller's Person record (must exist + must be a volunteer).
    const peopleSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("people")
      .where("user_id", "==", callerUid)
      .where("is_volunteer", "==", true)
      .limit(1)
      .get();
    if (peopleSnap.empty) {
      return NextResponse.json(
        { error: "No active volunteer record linked to your account" },
        { status: 403 },
      );
    }
    const person = { id: peopleSnap.docs[0].id, ...peopleSnap.docs[0].data() } as Person;
    if (person.status !== "active") {
      return NextResponse.json({ error: "Volunteer is not active" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const scheduleRef = churchRef.collection("schedules").doc(schedule_id);
    const serviceRef = churchRef.collection("services").doc(service_id);
    const ministryRef = churchRef.collection("ministries").doc(ministry_id);

    // Read service + ministry + church (orgPrereqs) BEFORE the transaction —
    // they're slow-changing and the transaction itself only needs to look at
    // schedule + assignments for race-safety.
    const [serviceSnap, ministrySnap, churchSnap] = await Promise.all([
      serviceRef.get(),
      ministry_id === ORG_WIDE_MINISTRY_ID ? Promise.resolve(null) : ministryRef.get(),
      churchRef.get(),
    ]);
    if (!serviceSnap.exists) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    const service = { id: serviceSnap.id, ...serviceSnap.data() } as Service;
    const ministry =
      ministrySnap && ministrySnap.exists
        ? ({ id: ministrySnap.id, ...ministrySnap.data() } as Ministry)
        : null;
    const orgPrereqs = ((churchSnap.data() as Church | undefined)?.org_prerequisites) || [];

    // Find the role on this service (across all ministries it serves).
    const allSms = getServiceMinistries(service, service_date);
    const sm = allSms.find((m) => m.ministry_id === ministry_id);
    const role = sm?.roles.find((r) => r.role_id === role_id);
    if (!role) {
      return NextResponse.json(
        { error: "Role not found on this service for the specified ministry" },
        { status: 404 },
      );
    }

    // Eligibility checks (apply before transaction since they don't race).
    if (!canServeInMinistry(person, ministry_id)) {
      return NextResponse.json(
        { error: "You are not on this team. Ask an admin to add you." },
        { status: 403 },
      );
    }
    const ministriesForCheck = ministry ? [ministry] : undefined;
    if (
      !hasCompletedPrerequisites(person, ministry_id, ministriesForCheck, orgPrereqs, role_id)
    ) {
      return NextResponse.json(
        {
          error:
            "Complete (or renew) your prerequisites for this team before claiming a slot.",
        },
        { status: 403 },
      );
    }

    // Transaction: schedule status + slot capacity + write the claim.
    const newAssignmentRef = churchRef.collection("assignments").doc();
    const result = await adminDb.runTransaction(async (txn) => {
      const scheduleSnap = await txn.get(scheduleRef);
      if (!scheduleSnap.exists) {
        return { error: "Schedule not found", status: 404 };
      }
      const schedule = { id: scheduleSnap.id, ...scheduleSnap.data() } as Schedule;

      if (normalizeWorkflowMode(schedule.workflow_mode) !== "self-service") {
        return {
          error: "This schedule isn't self-service; ask an admin to assign you.",
          status: 409,
        };
      }
      if (schedule.status !== "draft" && schedule.status !== "in_review") {
        return {
          error: "Schedule is no longer accepting claims.",
          status: 409,
        };
      }
      if (
        service_date < schedule.date_range_start ||
        service_date > schedule.date_range_end
      ) {
        return {
          error: "Service date is outside this schedule's range.",
          status: 400,
        };
      }
      if (
        schedule.ministry_ids &&
        schedule.ministry_ids.length > 0 &&
        !schedule.ministry_ids.includes(ministry_id)
      ) {
        return {
          error: "Ministry is not in this schedule's scope.",
          status: 400,
        };
      }

      // Count existing assignments for this exact slot (race-relevant read).
      const existingSnap = await txn.get(
        churchRef
          .collection("assignments")
          .where("schedule_id", "==", schedule_id)
          .where("service_id", "==", service_id)
          .where("service_date", "==", service_date)
          .where("role_id", "==", role_id),
      );

      const nonTrainee = existingSnap.docs.filter(
        (d) => (d.data().assignment_type ?? "regular") !== "trainee",
      );
      if (nonTrainee.length >= role.count) {
        return { error: "This slot is already filled.", status: 409 };
      }

      const alreadyClaimed = existingSnap.docs.some(
        (d) => d.data().person_id === person.id,
      );
      if (alreadyClaimed) {
        return { error: "You already have this slot.", status: 409 };
      }

      // Also reject if the volunteer has any OTHER assignment for the same
      // service+date (no double-booking on the same service occurrence).
      const sameOccurrenceSnap = await txn.get(
        churchRef
          .collection("assignments")
          .where("schedule_id", "==", schedule_id)
          .where("service_id", "==", service_id)
          .where("service_date", "==", service_date)
          .where("person_id", "==", person.id),
      );
      if (sameOccurrenceSnap.size > 0) {
        return {
          error: "You're already serving in this service. Pick a different occurrence.",
          status: 409,
        };
      }

      const newAssignment: Omit<Assignment, "id"> = {
        schedule_id,
        church_id,
        service_id,
        event_id: null,
        service_date,
        volunteer_id: person.id,
        person_id: person.id,
        role_id,
        role_title: role.title,
        ministry_id,
        status: "confirmed",
        // Wave 2.2 denorm: inherit parent schedule's current status.
        // Claim only allowed when schedule.status is "draft" or
        // "in_review" (gated above), so this is what gets stamped.
        // Future schedule transitions (approve / publish) fan out via
        // fanOutScheduleStatus and update this field on the new doc too.
        schedule_status: schedule.status,
        signup_type: "self_signup",
        assignment_type: "regular",
        confirmation_token: crypto.randomUUID(),
        responded_at: new Date().toISOString(),
        reminder_sent_at: [],
        attended: null,
        attended_at: null,
      };
      txn.set(newAssignmentRef, newAssignment);
      return { ok: true, id: newAssignmentRef.id };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Best-effort: in-app notification confirming the claim.
    try {
      await createUserNotification({
        user_id: callerUid,
        church_id,
        type: "schedule_assignment",
        title: `You claimed ${role.title}`,
        body: `${service.name} on ${service_date}`,
        metadata: {
          link_href: "/dashboard/my-schedule",
          schedule_id,
          assignment_id: result.id,
        },
      });
    } catch (notifErr) {
      console.error("[POST /api/assignments/claim] notification failed:", notifErr);
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    const code = (err as { code?: string | number })?.code;
    const message = (err as Error)?.message || "Internal error";
    console.error("[POST /api/assignments/claim] error:", err);
    if (code === "failed-precondition" || code === 9) {
      return NextResponse.json(
        {
          error:
            "Claim query needs a composite index. Re-run `firebase deploy --only firestore:indexes`.",
          detail: message,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

/**
 * DELETE /api/assignments/claim?church_id=X&assignment_id=Y
 *
 * Volunteer releases their own claim. Only allowed while the parent
 * schedule is still in draft (in_review starts the lockdown).
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const callerUid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const church_id = searchParams.get("church_id");
    const assignment_id = searchParams.get("assignment_id");
    if (!church_id || !assignment_id) {
      return NextResponse.json(
        { error: "Missing church_id or assignment_id" },
        { status: 400 },
      );
    }

    const memSnap = await adminDb.doc(`memberships/${callerUid}_${church_id}`).get();
    if (!memSnap.exists || memSnap.data()?.status !== "active") {
      return NextResponse.json({ error: "Not an active member" }, { status: 403 });
    }

    const peopleSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("people")
      .where("user_id", "==", callerUid)
      .limit(1)
      .get();
    const personId = peopleSnap.empty ? null : peopleSnap.docs[0].id;

    const churchRef = adminDb.collection("churches").doc(church_id);
    const aRef = churchRef.collection("assignments").doc(assignment_id);
    const aSnap = await aRef.get();
    if (!aSnap.exists) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    const a = aSnap.data()!;
    if (a.person_id !== personId) {
      return NextResponse.json(
        { error: "You can only release your own claims." },
        { status: 403 },
      );
    }
    if (a.signup_type !== "self_signup") {
      return NextResponse.json(
        { error: "Not a self-service claim — talk to your admin." },
        { status: 409 },
      );
    }

    // Schedule must still be in draft to release.
    const sSnap = await churchRef.collection("schedules").doc(a.schedule_id as string).get();
    const sStatus = sSnap.data()?.status;
    if (sStatus && sStatus !== "draft") {
      return NextResponse.json(
        {
          error:
            "Schedule has moved past draft — ask your admin if you need to step down.",
        },
        { status: 409 },
      );
    }

    await aRef.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/assignments/claim] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
