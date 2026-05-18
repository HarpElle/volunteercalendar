import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildAvailabilityWindowEmail } from "@/lib/utils/emails";
import type { Person, Schedule } from "@/lib/types";
import { getBaseUrl } from "@/lib/utils/base-url";
import { resend } from "@/lib/resend";
import { createUserNotificationBatch } from "@/lib/services/user-notifications";

/**
 * POST /api/schedules/{id}/availability-window
 *
 * Send availability window broadcast email to all active volunteers.
 * Rate-limited: will not re-send if already sent within the last hour.
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

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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

    // Rate limit: don't re-send within 1 hour
    if (schedule.availability_window?.reminder_sent_at) {
      const lastSent = new Date(schedule.availability_window.reminder_sent_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastSent > oneHourAgo) {
        return NextResponse.json(
          { error: "Availability reminder was sent less than an hour ago" },
          { status: 429 },
        );
      }
    }

    if (!schedule.availability_window?.due_date) {
      return NextResponse.json(
        { error: "No availability window configured on this schedule" },
        { status: 400 },
      );
    }

    // Fetch all active volunteers
    const volSnap = await churchRef
      .collection("people")
      .where("is_volunteer", "==", true)
      .where("status", "==", "active")
      .get();

    const volunteers: Person[] = volSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Person),
    );

    const baseUrl = getBaseUrl(req);
    const coveragePeriod = `${schedule.date_range_start} to ${schedule.date_range_end}`;

    // Send emails in batches
    let sentCount = 0;
    const batchSize = 50;
    for (let i = 0; i < volunteers.length; i += batchSize) {
      const batch = volunteers.slice(i, i + batchSize);
      await Promise.all(
        batch
          .filter((v) => v.email)
          .map(async (v) => {
            const email = buildAvailabilityWindowEmail({
              volunteerName: v.name,
              churchName,
              coveragePeriod,
              dueDate: schedule.availability_window!.due_date,
              message: schedule.availability_window!.message || null,
              availabilityUrl: `${baseUrl}/dashboard/my-schedule?tab=availability`,
            });

            await resend.emails.send({
              from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
              to: v.email!,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
            sentCount++;
          }),
      );
    }

    // Update schedule with send timestamp
    await scheduleRef.update({
      "availability_window.reminder_sent_at": new Date().toISOString(),
    });

    // Codex Run 3 retest (2026-05-17): emails alone aren't enough — the
    // volunteer's dashboard needs an in-app banner so the request is
    // unmissable when they log in. Fan out a notification per volunteer
    // (best-effort: skips people not linked to a Firebase user account).
    const personIds = volunteers.map((v) => v.id);
    let notifSent = 0;
    if (personIds.length > 0) {
      const membershipSnap = await adminDb
        .collection("memberships")
        .where("church_id", "==", church_id)
        .where("status", "==", "active")
        .get();

      const userIdByPersonId = new Map<string, string>();
      for (const doc of membershipSnap.docs) {
        const m = doc.data();
        if (m.volunteer_id && m.user_id) {
          userIdByPersonId.set(m.volunteer_id as string, m.user_id as string);
        }
      }

      const notifications = volunteers
        .map((v) => {
          const uid = userIdByPersonId.get(v.id);
          if (!uid) return null;
          return {
            user_id: uid,
            church_id,
            type: "availability_request" as const,
            title: "Availability requested",
            body: `${churchName} is collecting availability for ${coveragePeriod}. Please respond by ${schedule.availability_window!.due_date}.`,
            metadata: {
              schedule_id: scheduleId,
              due_date: schedule.availability_window!.due_date,
              link_href: "/dashboard/my-availability",
            },
          };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);

      if (notifications.length > 0) {
        await createUserNotificationBatch(notifications);
        notifSent = notifications.length;
      }
    }

    return NextResponse.json({
      success: true,
      emails_sent: sentCount,
      notifications_sent: notifSent,
      total_volunteers: volunteers.length,
    });
  } catch (error) {
    console.error("[POST /api/schedules/[id]/availability-window]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
