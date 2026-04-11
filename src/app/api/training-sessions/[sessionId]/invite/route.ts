import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildTrainingSessionInviteEmail } from "@/lib/utils/emails/training-session-invite";
import type { VolunteerJourneyStep, TrainingSessionRsvp } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/training-sessions/[sessionId]/invite
 *
 * Sends invitation emails to all volunteers who have a pending "class"
 * prerequisite step matching this session's prerequisite_step_id.
 *
 * Body: { church_id }
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

    const { church_id } = await req.json();
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists || !["owner", "admin", "scheduler"].includes(membership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch session
    const sessionSnap = await adminDb.doc(`churches/${church_id}/training_sessions/${sessionId}`).get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionSnap.data()!;

    if (session.status !== "scheduled") {
      return NextResponse.json({ error: "Session is not scheduled" }, { status: 400 });
    }

    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchName = (churchSnap.data()?.name as string) || "Church";

    // Calculate spots remaining
    const rsvps = (session.rsvps as TrainingSessionRsvp[]) || [];
    const acceptedCount = rsvps.filter((r) => r.status === "accepted").length;
    const spotsRemaining = session.capacity > 0 ? session.capacity - acceptedCount : 999;

    // Find volunteers with a pending step matching this session's prerequisite
    const volunteersSnap = await adminDb.collection(`churches/${church_id}/people`).where("is_volunteer", "==", true).get();
    const stepId = session.prerequisite_step_id as string;
    const ministryId = session.ministry_id as string;

    const origin = req.headers.get("origin")
      || req.headers.get("referer")?.replace(/\/[^/]*$/, "")
      || "https://volunteercal.com";

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const volDoc of volunteersSnap.docs) {
      const volData = volDoc.data();
      const email = volData.email as string;
      if (!email) {
        skipped++;
        continue;
      }

      // Already RSVP'd? Skip.
      if (rsvps.some((r) => r.volunteer_id === volDoc.id)) {
        skipped++;
        continue;
      }

      // Check if this volunteer has a pending/in_progress step for this prerequisite
      const journey = (volData.volunteer_journey as VolunteerJourneyStep[]) || [];
      const step = journey.find((s) => s.step_id === stepId && s.ministry_id === ministryId);

      // Send if step is pending/in_progress, or if no journey step exists yet
      // (volunteer hasn't started onboarding but is assigned to the ministry)
      const needsStep = !step || step.status === "pending" || step.status === "in_progress";
      if (!needsStep) {
        skipped++;
        continue;
      }

      const rsvpUrl = `${origin}/dashboard/training?session=${sessionId}&church=${church_id}`;

      try {
        const { subject, html, text } = buildTrainingSessionInviteEmail({
          volunteerName: (volData.name as string) || "Volunteer",
          churchName,
          sessionTitle: session.title as string,
          sessionDate: session.date as string,
          startTime: session.start_time as string,
          endTime: session.end_time as string,
          location: session.location as string,
          spotsRemaining,
          rsvpUrl,
        });

        await resend.emails.send({
          from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
          to: email,
          subject,
          html,
          text,
        });
        sent++;
      } catch (err) {
        errors.push(`Failed to invite ${email}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("training-sessions invite error:", err);
    return NextResponse.json({ error: "Failed to send invitations" }, { status: 500 });
  }
}
