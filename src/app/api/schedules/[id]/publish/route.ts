import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Resend } from "resend";
import { buildConfirmationEmail } from "@/lib/utils/emails";
import type { Schedule, Assignment, Person, Service } from "@/lib/types";
import { getBaseUrl } from "@/lib/utils/base-url";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/schedules/{id}/publish
 *
 * Publishes a schedule after all ministry approvals are complete.
 * Transitions status to "published" and sends confirmation emails
 * to all assigned volunteers.
 */
export async function POST(
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

    const body = await req.json();
    const { church_id } = body as { church_id: string };

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify admin role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Only admins can publish schedules" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const scheduleRef = churchRef.collection("schedules").doc(scheduleId);
    const [scheduleSnap, churchSnap] = await Promise.all([
      scheduleRef.get(),
      churchRef.get(),
    ]);

    if (!scheduleSnap.exists) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const schedule = { id: scheduleSnap.id, ...scheduleSnap.data()! } as Schedule;
    const churchName = churchSnap.data()?.name || "Your Church";

    // Check all ministry approvals (warning if not all approved)
    const approvals = schedule.ministry_approvals || {};
    const unapproved = Object.entries(approvals)
      .filter(([, a]) => a.status !== "approved")
      .map(([id]) => id);

    // Allow publish even with unapproved teams (admin override), but warn
    const hasUnapprovedTeams = unapproved.length > 0;

    const now = new Date().toISOString();

    // Transition to published
    await scheduleRef.update({
      status: "published",
      published_at: now,
    });

    // Fetch all draft assignments for this schedule
    const assignSnap = await churchRef
      .collection("assignments")
      .where("schedule_id", "==", scheduleId)
      .where("status", "==", "draft")
      .get();

    // Generate confirmation tokens and send emails
    const [peopleSnap, serviceSnap] = await Promise.all([
      churchRef.collection("people").get(),
      churchRef.collection("services").get(),
    ]);

    const volunteersMap = new Map<string, Person>();
    // Index by person doc ID and by any stored legacy volunteer_id
    peopleSnap.docs.forEach((d) => {
      const data = d.data();
      const vol = { id: d.id, name: data.name, email: data.email, ...data } as unknown as Person;
      volunteersMap.set(d.id, vol);
      if (data.volunteer_id) volunteersMap.set(data.volunteer_id as string, vol);
    });

    const servicesMap = new Map<string, Service>();
    serviceSnap.docs.forEach((d) => {
      servicesMap.set(d.id, { id: d.id, ...d.data() } as Service);
    });

    const baseUrl = getBaseUrl(req);
    let emailsSent = 0;
    let emailsFailed = 0;
    const batch = adminDb.batch();

    for (const doc of assignSnap.docs) {
      const assignment = { id: doc.id, ...doc.data() } as Assignment;
      const volunteer = volunteersMap.get(assignment.person_id);
      const service = assignment.service_id ? servicesMap.get(assignment.service_id) : null;

      if (!volunteer?.email) continue;

      // Generate a fresh confirmation token
      const confirmToken = crypto.randomUUID();
      batch.update(doc.ref, { confirmation_token: confirmToken });

      const email = buildConfirmationEmail({
        volunteerName: volunteer.name,
        churchName,
        serviceName: service?.name || "Service",
        ministryName: assignment.ministry_id,
        roleTitle: assignment.role_title,
        serviceDate: assignment.service_date,
        startTime: service?.start_time || "",
        confirmUrl: `${baseUrl}/confirm/${confirmToken}`,
      });

      try {
        const result = await resend.emails.send({
          from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
          to: volunteer.email!,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        if (result.error) {
          console.error("[publish] Resend error:", result.error, "to:", volunteer.email);
          emailsFailed++;
        } else {
          emailsSent++;
        }
      } catch (err) {
        console.error("[publish] Email send threw:", err, "to:", volunteer.email);
        emailsFailed++;
      }
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      published_at: now,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      total_assignments: assignSnap.docs.length,
      unapproved_teams: hasUnapprovedTeams ? unapproved : [],
    });
  } catch (error) {
    console.error("[POST /api/schedules/[id]/publish]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
