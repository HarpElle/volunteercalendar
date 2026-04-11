import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { VolunteerJourneyStep } from "@/lib/types";

/**
 * POST /api/training-sessions/[sessionId]/complete
 *
 * Marks a training session as completed and optionally auto-completes
 * the linked prerequisite step for all attendees.
 *
 * Body: { church_id, attendee_ids: string[] }
 * Auth: Bearer token + admin/scheduler role
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { church_id, attendee_ids } = await req.json();
    if (!church_id || !Array.isArray(attendee_ids)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists || !["owner", "admin", "scheduler"].includes(membership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const ref = adminDb.doc(`churches/${church_id}/training_sessions/${sessionId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const session = snap.data()!;

    // Update session status + attendee list
    await ref.update({
      status: "completed",
      attendee_ids,
    });

    // Auto-complete prerequisite steps for attendees if enabled
    let stepsCompleted = 0;

    if (session.auto_complete && attendee_ids.length > 0) {
      const stepId = session.prerequisite_step_id as string;
      const ministryId = session.ministry_id as string;
      const nowIso = new Date().toISOString();

      for (const volId of attendee_ids) {
        const volRef = adminDb.doc(`churches/${church_id}/people/${volId}`);
        const volSnap = await volRef.get();
        if (!volSnap.exists) continue;

        const journey = (volSnap.data()?.volunteer_journey as VolunteerJourneyStep[]) || [];

        // Find the matching journey step
        const stepIndex = journey.findIndex(
          (s) => s.step_id === stepId && s.ministry_id === ministryId,
        );

        if (stepIndex >= 0) {
          // Update existing step to completed
          if (journey[stepIndex].status !== "completed") {
            journey[stepIndex] = {
              ...journey[stepIndex],
              status: "completed",
              completed_at: nowIso,
              verified_by: userId,
              notes: `Auto-completed via training session: ${session.title}`,
            };
            await volRef.update({ volunteer_journey: journey });
            stepsCompleted++;
          }
        } else {
          // Create a new completed journey step
          journey.push({
            step_id: stepId,
            ministry_id: ministryId,
            status: "completed",
            completed_at: nowIso,
            verified_by: userId,
            notes: `Auto-completed via training session: ${session.title}`,
          });
          await volRef.update({ volunteer_journey: journey });
          stepsCompleted++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      attendees_marked: attendee_ids.length,
      steps_completed: stepsCompleted,
    });
  } catch (err) {
    console.error("training-sessions complete error:", err);
    return NextResponse.json({ error: "Failed to complete session" }, { status: 500 });
  }
}
