import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildReminderEmail, buildReminderSms } from "@/lib/utils/email-templates";
import { sendSms } from "@/lib/services/sms";
import { safeCompare } from "@/lib/utils/safe-compare";
import type { NotificationType, NotificationChannel } from "@/lib/types";
import { resolveUserId, createUserNotification } from "@/lib/services/user-notifications";
import { getBaseUrl } from "@/lib/utils/base-url";
import { resend } from "@/lib/resend";
import { log } from "@/lib/log";
import type { DocumentReference } from "firebase-admin/firestore";

// ─── Idempotency helpers (Wave 2.1) ──────────────────────────────────────────
//
// The previous shape stored an array of "kind:timestamp" strings on the
// assignment doc and appended via a non-transactional batch read-then-write.
// Two concurrent cron invocations (Vercel retries, manual + scheduled
// overlap) could both read an empty array, both append, and both dispatch
// — resulting in duplicate reminders.
//
// New shape: a map `reminder_dispatches` on the assignment doc, keyed by
// `${kind}_${channel}`. Each value carries `claimed_at` + `status`
// ("claimed" | "sent" | "failed"). The claim is written inside a Firestore
// transaction so only one cron invocation wins the race; the loser's
// transaction retries and reads the now-existing key, returning `false`.
//
// Per-channel: a partial failure where email sent but SMS errored doesn't
// poison the whole assignment. The SMS slot remains unclaimed and can be
// retried on the next cron pass.

type ReminderChannel = Extract<NotificationChannel, "email" | "sms">;

interface ReminderDispatchEntry {
  claimed_at: string;
  status: "claimed" | "sent" | "failed";
  completed_at?: string;
  error_message?: string;
  /** When set, this entry was inferred from the legacy reminder_sent_at array, not a real claim. */
  backfilled_from?: "legacy_array";
}

/**
 * Atomically claim the (assignment, kind, channel) slot. Returns true if
 * we won the race and the caller should proceed to dispatch; false if
 * another invocation already claimed (or the legacy array indicates this
 * kind was sent in a prior deploy).
 *
 * Side-effect on a false-because-legacy result: backfills the new shape
 * with `status: "sent", backfilled_from: "legacy_array"` so subsequent
 * cron runs skip the legacy check.
 */
async function claimReminderDispatch(
  assignmentRef: DocumentReference,
  kind: NotificationType,
  channel: ReminderChannel,
): Promise<boolean> {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(assignmentRef);
    const data = snap.data() ?? {};
    const dispatches =
      (data.reminder_dispatches as Record<string, ReminderDispatchEntry>) ?? {};
    const key = `${kind}_${channel}`;
    if (dispatches[key]) return false;

    // Legacy-grace: the old shape stored entries like
    // "reminder_48h:2026-05-24T..." in a single string array. If THIS
    // kind appears there, treat it as already-sent for BOTH channels —
    // we can't distinguish channel from the legacy format, and a
    // false-skip on a never-sent SMS is far better than a duplicate.
    const legacy = (data.reminder_sent_at as string[]) ?? [];
    if (legacy.some((entry) => entry.startsWith(`${kind}:`))) {
      tx.update(assignmentRef, {
        [`reminder_dispatches.${key}`]: {
          claimed_at: new Date().toISOString(),
          status: "sent",
          backfilled_from: "legacy_array",
        } satisfies ReminderDispatchEntry,
      });
      return false;
    }

    tx.update(assignmentRef, {
      [`reminder_dispatches.${key}`]: {
        claimed_at: new Date().toISOString(),
        status: "claimed",
      } satisfies ReminderDispatchEntry,
    });
    return true;
  });
}

/**
 * Record the outcome of a previously-claimed dispatch. Non-transactional —
 * we already own the slot; this is just an observability/state update.
 * Failures here don't break idempotency (the claim stays in place either
 * way) but they do degrade the "sent vs claimed" signal.
 */
async function markReminderDispatchResult(
  assignmentRef: DocumentReference,
  kind: NotificationType,
  channel: ReminderChannel,
  status: "sent" | "failed",
  errorMessage?: string | null,
): Promise<void> {
  const key = `${kind}_${channel}`;
  const update: Record<string, unknown> = {
    [`reminder_dispatches.${key}.status`]: status,
    [`reminder_dispatches.${key}.completed_at`]: new Date().toISOString(),
  };
  if (errorMessage) {
    update[`reminder_dispatches.${key}.error_message`] = errorMessage;
  }
  try {
    await assignmentRef.update(update);
  } catch (err) {
    // Don't bubble — the dispatch already happened, the claim already
    // marked the slot. The result-tracking failure is observability-only.
    log.warn("reminder dispatch result update failed", {
      error: err,
      assignment_id: assignmentRef.id,
      kind,
      channel,
      status,
    });
  }
}

/**
 * POST /api/reminders
 *
 * Sends scheduled reminders (48h or 24h) to volunteers with upcoming assignments.
 * Can be called by a cron job or manually by an admin.
 *
 * Body: { church_id: string, hours?: 24 | 48 }
 * Auth: Bearer token (admin) or cron secret
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { church_id, hours: rawHours = 48 } = body;
    const hours = Math.min(Math.max(Number(rawHours) || 48, 1), 168); // 1h to 7d

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Validate auth: either admin Bearer token or CRON_SECRET header
    const cronSecret = request.headers.get("x-cron-secret");
    const authHeader = request.headers.get("authorization");

    if (!safeCompare(cronSecret, process.env.CRON_SECRET) && !authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If Bearer token, verify admin role
    if (authHeader?.startsWith("Bearer ") && !cronSecret) {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await adminAuth.verifyIdToken(token);

      const membershipId = `${decoded.uid}_${church_id}`;
      const memberSnap = await adminDb.collection("memberships").doc(membershipId).get();
      const membership = memberSnap.data();
      if (!membership || !["owner", "admin"].includes(membership.role as string)) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    // Fetch church info
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const church = churchSnap.data() as Record<string, unknown>;
    const churchName = (church.name as string) || "Organization";
    // W11-C: church logo for email header. Null/undefined = template
    // falls back to the existing text-only header.
    const churchLogoUrl =
      (church.logo_url as string | null | undefined) ?? null;
    const defaultChannels = ((church.settings as Record<string, unknown>)?.default_reminder_channels as string[]) || ["email"];

    // Calculate the target date window
    const now = new Date();
    const targetDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Fetch assignments for the target date
    type DocRecord = Record<string, unknown> & { id: string };
    const assignSnap = await adminDb.collection(`churches/${church_id}/assignments`).get();
    const allAssignments: DocRecord[] = assignSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // Filter to assignments on the target date that haven't been declined.
    // Note: we DO NOT pre-filter by reminder-sent state here anymore. The
    // per-(assignment, kind, channel) idempotency check now lives in the
    // claimReminderDispatch transaction below, so an assignment that
    // already got an email reminder is still eligible for the SMS path
    // if SMS hasn't been claimed yet.
    const reminderType: NotificationType = hours <= 24 ? "reminder_24h" : "reminder_48h";
    const targetAssignments = allAssignments.filter((a) => {
      if (a.service_date !== targetDateStr) return false;
      if (a.status === "declined" || a.status === "no_show") return false;
      return true;
    });

    if (targetAssignments.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No assignments found for ${targetDateStr} that need ${reminderType} reminders`,
        sent_email: 0,
        sent_sms: 0,
        skipped: 0,
      });
    }

    // Fetch volunteers, services, ministries
    const [volSnap, svcSnap, minSnap] = await Promise.all([
      adminDb.collection(`churches/${church_id}/people`).where("is_volunteer", "==", true).get(),
      adminDb.collection(`churches/${church_id}/services`).get(),
      adminDb.collection(`churches/${church_id}/ministries`).get(),
    ]);

    const volunteerMap = new Map(
      volSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as DocRecord]),
    );
    const serviceMap = new Map(
      svcSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );
    const ministryMap = new Map(
      minSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );

    const origin = getBaseUrl(request);

    let sentEmail = 0;
    let sentSms = 0;
    let skipped = 0;
    const errors: string[] = [];

    /** Helper to log a notification to Firestore */
    async function logNotification(data: {
      volunteer_id: string;
      volunteer_name: string;
      volunteer_email: string;
      volunteer_phone: string | null;
      assignment_id: string;
      schedule_id: string | null;
      channel: NotificationChannel;
      status: string;
      error_message: string | null;
      external_id: string | null;
    }) {
      await adminDb.collection("sent_notifications").add({
        church_id,
        ...data,
        type: reminderType,
        sent_at: new Date().toISOString(),
      });
    }

    for (const assignment of targetAssignments) {
      const volunteer = volunteerMap.get(assignment.person_id as string);
      if (!volunteer) {
        skipped++;
        continue;
      }

      const email = volunteer.email as string;
      const phone = (volunteer.phone as string) || null;
      const volName = (volunteer.name as string) || "Volunteer";

      // Determine which channels to use for this volunteer
      const volPrefs = (volunteer.reminder_preferences as Record<string, unknown>)?.channels as string[] | undefined;
      const channels: string[] = volPrefs?.length ? volPrefs : defaultChannels;

      if (channels.length === 1 && channels[0] === "none") {
        skipped++;
        continue;
      }

      const service = serviceMap.get(assignment.service_id as string);
      const ministry = ministryMap.get(assignment.ministry_id as string);
      const confirmToken = assignment.confirmation_token as string;
      const confirmUrl = `${origin}/confirm/${confirmToken}`;

      const templateData = {
        volunteerName: volName,
        churchName,
        churchLogoUrl,
        serviceName: (service?.name as string) || "Service",
        ministryName: (ministry?.name as string) || "Team",
        roleTitle: (assignment.role_title as string) || "Volunteer",
        serviceDate: assignment.service_date as string,
        startTime: (service?.start_time as string) || "",
        hoursUntil: hours as number,
        confirmUrl,
      };

      const notifBase = {
        volunteer_id: assignment.volunteer_id as string,
        volunteer_name: volName,
        volunteer_email: email,
        volunteer_phone: phone,
        assignment_id: assignment.id,
        schedule_id: (assignment.schedule_id as string) || null,
      };

      const assignmentRef = adminDb.doc(
        `churches/${church_id}/assignments/${assignment.id}`,
      );

      // Send email reminder
      if (channels.includes("email") && email && process.env.RESEND_API_KEY) {
        const claimed = await claimReminderDispatch(
          assignmentRef,
          reminderType,
          "email",
        );
        if (!claimed) {
          skipped++;
        } else {
          const { subject, html, text } = buildReminderEmail(templateData);
          try {
            const result = await resend.emails.send({
              from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
              replyTo: "info@volunteercal.com",
              to: [email],
              subject,
              html,
              text,
            });
            sentEmail++;
            await markReminderDispatchResult(assignmentRef, reminderType, "email", "sent");
            await logNotification({
              ...notifBase,
              channel: "email",
              status: "sent",
              error_message: null,
              external_id: (result as Record<string, unknown>).id as string || null,
            });
          } catch (err) {
            const errMsg = (err as Error).message;
            errors.push(`Email to ${email}: ${errMsg}`);
            await markReminderDispatchResult(assignmentRef, reminderType, "email", "failed", errMsg);
            await logNotification({
              ...notifBase,
              channel: "email",
              status: "failed",
              error_message: errMsg,
              external_id: null,
            });
          }
        }
      }

      // Send SMS reminder
      if (channels.includes("sms") && phone) {
        const claimed = await claimReminderDispatch(
          assignmentRef,
          reminderType,
          "sms",
        );
        if (!claimed) {
          skipped++;
        } else {
          const smsBody = buildReminderSms(templateData);
          const smsResult = await sendSms({ to: phone, body: smsBody });

          if (smsResult.success) {
            sentSms++;
          } else {
            errors.push(`SMS to ${phone}: ${smsResult.error}`);
          }

          await markReminderDispatchResult(
            assignmentRef,
            reminderType,
            "sms",
            smsResult.success ? "sent" : "failed",
            smsResult.error,
          );
          await logNotification({
            ...notifBase,
            channel: "sms",
            status: smsResult.success ? "sent" : "failed",
            error_message: smsResult.error,
            external_id: smsResult.sid,
          });
        }
      }

      // Fire-and-forget: create in-app reminder notification
      try {
        const reminderUserId = await resolveUserId(church_id, assignment.volunteer_id as string);
        if (reminderUserId) {
          const reminderTitle = hours <= 24
            ? "Reminder: You're serving tomorrow"
            : "Reminder: You're serving in 2 days";
          const roleTitle = (assignment.role_title as string) || "Volunteer";
          const svcDate = assignment.service_date as string;

          await createUserNotification({
            user_id: reminderUserId,
            church_id,
            type: "reminder",
            title: reminderTitle,
            body: `${roleTitle} on ${svcDate}`,
            metadata: { service_date: svcDate, link_href: "/dashboard/my-schedule" },
          });
        }
      } catch (notifErr) {
        log.error("User notification error (reminder)", { error: notifErr });
      }
    }

    // Idempotency note: each (assignment, kind, channel) is claimed
    // inside its own Firestore transaction above, so concurrent cron
    // invocations (Vercel retries, manual + scheduled overlap) can't
    // double-fire reminders. See claimReminderDispatch for the full
    // semantics.

    return NextResponse.json({
      success: true,
      target_date: targetDateStr,
      reminder_type: reminderType,
      sent_email: sentEmail,
      sent_sms: sentSms,
      skipped,
      total: targetAssignments.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    log.error("POST /api/reminders failed", { error });
    return NextResponse.json(
      { error: "Failed to send reminders" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reminders?church_id=xxx
 *
 * Returns sent notification history for a church (admin view).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("church_id");

    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);

    const membershipId = `${decoded.uid}_${churchId}`;
    const memberSnap = await adminDb.collection("memberships").doc(membershipId).get();
    const membership = memberSnap.data();
    if (!membership || !["owner", "admin"].includes(membership.role as string)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Fetch sent notifications for this church
    const notifSnap = await adminDb
      .collection("sent_notifications")
      .where("church_id", "==", churchId)
      .orderBy("sent_at", "desc")
      .limit(200)
      .get();

    const notifications = notifSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ notifications });
  } catch (error) {
    log.error("GET /api/reminders failed", { error });
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
