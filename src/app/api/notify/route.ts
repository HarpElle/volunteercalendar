import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  buildBatchConfirmationEmail,
  type BatchAssignment,
} from "@/lib/utils/emails/batch-confirmation";
import { resolveUserId, createUserNotificationBatch } from "@/lib/services/user-notifications";
import { getBaseUrl } from "@/lib/utils/base-url";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    // Auth: Bearer token + admin/scheduler role check
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await request.json();
    const { church_id, schedule_id, status_filter, date_filter, volunteer_filter, role_filter } = body as {
      church_id: string;
      schedule_id: string;
      /** Only notify assignments with this status (e.g. "draft" for unanswered, "declined") */
      status_filter?: string;
      /** Only notify assignments for this service date (ISO string) */
      date_filter?: string;
      /** Only notify these specific volunteer IDs */
      volunteer_filter?: string[];
      /** Only notify assignments for these role IDs */
      role_filter?: string[];
    };

    if (!church_id || !schedule_id) {
      return NextResponse.json(
        { error: "Missing church_id or schedule_id" },
        { status: 400 },
      );
    }

    // Verify caller is admin or scheduler
    const membershipId = `${userId}_${church_id}`;
    const callerMembership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!callerMembership.exists || !["owner", "admin", "scheduler"].includes(callerMembership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured (RESEND_API_KEY missing)" },
        { status: 503 },
      );
    }

    // Fetch church
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const churchName = (churchSnap.data()?.name as string) || "Church";

    // Fetch assignments for this schedule (filtered server-side)
    type DocRecord = Record<string, unknown> & { id: string };
    const assignSnap = await adminDb.collection(`churches/${church_id}/assignments`)
      .where("schedule_id", "==", schedule_id)
      .get();
    let assignments: DocRecord[] = assignSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as DocRecord));

    // Apply optional filters for targeted re-invitations
    if (status_filter) {
      assignments = assignments.filter((a) => a.status === status_filter);
    }
    if (date_filter) {
      assignments = assignments.filter((a) => a.service_date === date_filter);
    }
    if (volunteer_filter && volunteer_filter.length > 0) {
      const volSet = new Set(volunteer_filter);
      assignments = assignments.filter((a) => volSet.has(a.person_id as string));
    }
    if (role_filter && role_filter.length > 0) {
      const roleSet = new Set(role_filter);
      assignments = assignments.filter((a) => roleSet.has(a.role_id as string));
    }

    if (assignments.length === 0) {
      return NextResponse.json({ error: "No assignments found matching filters" }, { status: 404 });
    }

    // Fetch people (volunteers), services, ministries
    const [volSnap, svcSnap, minSnap] = await Promise.all([
      adminDb.collection(`churches/${church_id}/people`).where("is_volunteer", "==", true).get(),
      adminDb.collection(`churches/${church_id}/services`).get(),
      adminDb.collection(`churches/${church_id}/ministries`).get(),
    ]);

    const volunteerMap = new Map(
      volSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );
    const serviceMap = new Map(
      svcSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );
    const ministryMap = new Map(
      minSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );

    // Determine base URL for confirmation links
    const origin = getBaseUrl(request);

    // Group assignments by volunteer to send one batched email per volunteer
    const byVolunteer = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const volId = a.person_id as string;
      if (!byVolunteer.has(volId)) byVolunteer.set(volId, []);
      byVolunteer.get(volId)!.push(a);
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [volId, volAssignments] of byVolunteer) {
      const volunteer = volunteerMap.get(volId);
      if (!volunteer) {
        skipped += volAssignments.length;
        continue;
      }

      const email = volunteer.email as string;
      if (!email) {
        skipped += volAssignments.length;
        continue;
      }

      // Build batched assignment list (skip already-responded)
      const pending: BatchAssignment[] = [];
      let volSkipped = 0;

      for (const assignment of volAssignments) {
        if (assignment.responded_at) {
          volSkipped++;
          continue;
        }

        const service = serviceMap.get(assignment.service_id as string);
        const ministry = ministryMap.get(assignment.ministry_id as string);
        const token = assignment.confirmation_token as string;

        pending.push({
          serviceDate: assignment.service_date as string,
          serviceName: (service?.name as string) || "Service",
          startTime: (service?.start_time as string) || "",
          ministryName: (ministry?.name as string) || "Ministry",
          roleTitle: (assignment.role_title as string) || "Volunteer",
          confirmUrl: `${origin}/confirm/${token}`,
        });
      }

      skipped += volSkipped;

      if (pending.length === 0) continue;

      // Send one batched email with all pending assignments
      const { subject, html, text } = buildBatchConfirmationEmail({
        volunteerName: (volunteer.name as string) || "Volunteer",
        churchName,
        assignments: pending,
      });

      try {
        await resend.emails.send({
          from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
          replyTo: "info@volunteercal.com",
          to: [email],
          subject,
          html,
          text,
        });
        sent += pending.length;
      } catch (err) {
        errors.push(`Failed to email ${email}: ${(err as Error).message}`);
      }
    }

    // Fire-and-forget: create in-app notifications for assigned volunteers
    try {
      const notifPayloads: Array<{
        user_id: string;
        church_id: string;
        type: "schedule_assignment";
        title: string;
        body: string;
        metadata: Record<string, string>;
      }> = [];

      const resolvedIds = await Promise.all(
        Array.from(byVolunteer.keys()).map(async (volId) => {
          const uid = await resolveUserId(church_id, volId);
          return { volId, uid };
        }),
      );

      for (const { uid } of resolvedIds) {
        if (!uid) continue;
        notifPayloads.push({
          user_id: uid,
          church_id,
          type: "schedule_assignment",
          title: "You've been scheduled",
          body: "You have new assignment(s) — check your schedule.",
          metadata: { link_href: "/dashboard/my-schedule" },
        });
      }

      if (notifPayloads.length > 0) {
        await createUserNotificationBatch(notifPayloads);
      }
    } catch (notifErr) {
      console.error("User notification error (schedule publish):", notifErr);
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      total: assignments.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Notify error:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 },
    );
  }
}
