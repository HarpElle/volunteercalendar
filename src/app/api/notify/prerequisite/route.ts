import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildStepCompletedEmail } from "@/lib/utils/emails/prerequisite-step-completed";
import { buildEligibleNotifyEmail } from "@/lib/utils/emails/prerequisite-eligible-notify";
import type { OnboardingStep, VolunteerJourneyStep } from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import { resolveUserId, createUserNotification } from "@/lib/services/user-notifications";
import { getBaseUrl } from "@/lib/utils/base-url";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/notify/prerequisite
 *
 * Sends prerequisite milestone notifications:
 *   type "step_completed" — congrats email to volunteer
 *   type "all_completed" — congrats email to volunteer + notify schedulers
 *
 * Body: { type, church_id, volunteer_id, step_id, ministry_id }
 * Auth: Bearer token + admin/scheduler role
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const callerUid = decoded.uid;

    const { type, church_id, volunteer_id, step_id, ministry_id } = await req.json();

    if (!type || !church_id || !volunteer_id || !ministry_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify caller is admin/scheduler
    const callerMembershipId = `${callerUid}_${church_id}`;
    const callerMembership = await adminDb.doc(`memberships/${callerMembershipId}`).get();
    if (!callerMembership.exists || !["owner", "admin", "scheduler"].includes(callerMembership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch church + volunteer (person)
    const [churchSnap, volunteerSnap] = await Promise.all([
      adminDb.doc(`churches/${church_id}`).get(),
      adminDb.doc(`churches/${church_id}/people/${volunteer_id}`).get(),
    ]);

    if (!churchSnap.exists || !volunteerSnap.exists) {
      return NextResponse.json({ error: "Church or volunteer not found" }, { status: 404 });
    }

    const churchName = (churchSnap.data()?.name as string) || "Church";
    const volunteerData = volunteerSnap.data()!;
    const volunteerName = (volunteerData.name as string) || "Volunteer";
    const volunteerEmail = volunteerData.email as string;

    if (!volunteerEmail) {
      return NextResponse.json({ error: "Volunteer has no email" }, { status: 400 });
    }

    // Resolve ministry name and prerequisites
    const isOrgWide = ministry_id === ORG_WIDE_MINISTRY_ID;
    let ministryName = "Organization";
    let prerequisites: OnboardingStep[] = [];

    if (isOrgWide) {
      prerequisites = (churchSnap.data()?.org_prerequisites as OnboardingStep[]) || [];
    } else {
      const ministrySnap = await adminDb.doc(`churches/${church_id}/ministries/${ministry_id}`).get();
      if (ministrySnap.exists) {
        ministryName = (ministrySnap.data()?.name as string) || "Ministry";
        prerequisites = (ministrySnap.data()?.prerequisites as OnboardingStep[]) || [];
      }
    }

    // Get volunteer journey progress for this ministry
    const journey = (volunteerData.volunteer_journey as VolunteerJourneyStep[]) || [];
    const ministrySteps = journey.filter((s) => s.ministry_id === ministry_id);
    const completedCount = ministrySteps.filter((s) => s.status === "completed" || s.status === "waived").length;
    const totalCount = prerequisites.length;

    const origin = getBaseUrl(req);
    const dashboardUrl = `${origin}/dashboard/my-journey`;

    const results: string[] = [];

    // Find step label
    const stepLabel = step_id
      ? prerequisites.find((p) => p.id === step_id)?.label || "Prerequisite step"
      : "Prerequisite step";

    if (type === "step_completed" || type === "all_completed") {
      // Send congratulatory email to volunteer
      const { subject, html, text } = buildStepCompletedEmail({
        volunteerName,
        churchName,
        stepLabel,
        ministryName,
        completedCount,
        totalCount,
        dashboardUrl,
      });

      await resend.emails.send({
        from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
        to: volunteerEmail,
        subject,
        html,
        text,
      });
      results.push(`step_completed email sent to ${volunteerEmail}`);

      // Fire-and-forget: in-app notification for step completion
      try {
        const volUserId = await resolveUserId(church_id, volunteer_id);
        if (volUserId) {
          await createUserNotification({
            user_id: volUserId,
            church_id,
            type: "prerequisite_milestone",
            title: `You completed ${stepLabel}!`,
            body: `${completedCount}/${totalCount} steps complete`,
            metadata: { link_href: "/dashboard/my-journey" },
          });
        }
      } catch (notifErr) {
        console.error("Step-completed user notification failed:", notifErr);
      }
    }

    if (type === "all_completed") {
      // Notify schedulers that this volunteer is now eligible
      const membershipsSnap = await adminDb
        .collection("memberships")
        .where("church_id", "==", church_id)
        .where("role", "in", ["owner", "admin", "scheduler"])
        .get();

      for (const memberDoc of membershipsSnap.docs) {
        const schedulerUserId = memberDoc.data().user_id as string;
        const schedulerUserSnap = await adminDb.doc(`users/${schedulerUserId}`).get();
        const schedulerEmail = schedulerUserSnap.data()?.email as string;
        const schedulerName = (schedulerUserSnap.data()?.display_name as string) || schedulerEmail;

        if (!schedulerEmail) continue;

        const { subject, html, text } = buildEligibleNotifyEmail({
          schedulerName,
          volunteerName,
          churchName,
          ministryName,
          dashboardUrl: `${origin}/dashboard/scheduling`,
        });

        try {
          await resend.emails.send({
            from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
            to: schedulerEmail,
            subject,
            html,
            text,
          });
          results.push(`eligible_notify email sent to ${schedulerEmail}`);
        } catch (err) {
          results.push(`failed to notify ${schedulerEmail}: ${(err as Error).message}`);
        }
      }

      // Fire-and-forget: in-app notification for all prerequisites completed
      try {
        const volUserId = await resolveUserId(church_id, volunteer_id);
        if (volUserId) {
          await createUserNotification({
            user_id: volUserId,
            church_id,
            type: "prerequisite_milestone",
            title: `You're now eligible for ${ministryName}!`,
            body: "All prerequisites are complete.",
            metadata: { link_href: "/dashboard/my-journey" },
          });
        }
      } catch (notifErr) {
        console.error("All-completed user notification failed:", notifErr);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("notify/prerequisite error:", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
