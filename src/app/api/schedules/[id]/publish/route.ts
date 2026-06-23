import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { buildConfirmationEmail } from "@/lib/utils/emails";
import { audit, userActor } from "@/lib/server/audit";
import { enqueueOutboxEntry } from "@/lib/server/outbox";
import { fanOutScheduleStatus } from "@/lib/server/schedule-status-fanout";
import { assertBearerToken, requireMembership } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import type { Schedule, Assignment, Person, Service } from "@/lib/types";
import { getBaseUrl } from "@/lib/utils/base-url";
import { resend } from "@/lib/resend";
import { resolveVolunteerEligibility, checkOrgGate } from "@/lib/server/notification-eligibility";

const BodySchema = z.object({
  church_id: z.string().min(1),
});

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
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, BodySchema);
  if (body instanceof NextResponse) return body;

  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;

  const { id: scheduleId } = await params;
  const { church_id } = body;
  const userId = auth.uid;

  try {
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
    // W11-C: church logo for confirmation emails. Null/undefined =
    // template falls back to the existing text-only header.
    const churchLogoUrl =
      (churchSnap.data()?.logo_url as string | null | undefined) ?? null;

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

    // Wave 2.2: fan out the new status to every assignment doc so the
    // Firestore rule can enforce volunteer visibility without an inline
    // get() (which Firestore's list-query rule engine rejects). Affects
    // ALL assignments under this schedule regardless of their own
    // per-doc status — the parent schedule transitioning is what makes
    // them volunteer-readable.
    await fanOutScheduleStatus(church_id, scheduleId, "published");

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
    let enqueuedRetries = 0;
    const batch = adminDb.batch();

    // Hybrid email strategy:
    //   1. Try sending the confirmation email inline via Resend.
    //   2. On send failure, enqueue to notification_outbox for the daily
    //      drain cron to retry.
    //
    // Why hybrid: Vercel Hobby tier limits crons to daily, so a pure-outbox
    // path would mean confirmation emails arrive up to 24h after publish —
    // unacceptable UX. Inline-with-outbox-fallback keeps publish snappy in
    // the happy path and resilient to Resend outages without making the
    // user wait. After upgrading to Pro tier we can switch the schedule to
    // every-2-minutes for near-realtime drain.
    type PendingEmail = {
      assignmentDocRef: FirebaseFirestore.DocumentReference;
      volunteerEmail: string;
      from: string;
      subject: string;
      html: string;
      text: string;
    };
    const pendingEmails: PendingEmail[] = [];

    // Antigravity F-002 perf: resolve eligibility for EVERY assignment
    // in parallel BEFORE the build loop. Fetch the org gate once and
    // pass it into each resolve, turning 3×N sequential reads (org doc
    // re-fetched per assignment) into org-once + 2×N parallel — large
    // publishes no longer risk the Vercel function timeout. Keyed by
    // assignment doc id so the build loop below reads its verdict.
    const orgGate = await checkOrgGate(church_id);
    const eligibilityEntries = await Promise.all(
      assignSnap.docs.map(async (doc) => {
        const personId = (doc.data() as Assignment).person_id;
        const eligibility = await resolveVolunteerEligibility(
          {
            churchId: church_id,
            personId,
            notificationType: "confirmation",
          },
          orgGate,
        );
        return [doc.id, eligibility] as const;
      }),
    );
    const eligibilityByAssignment = new Map(eligibilityEntries);

    for (const doc of assignSnap.docs) {
      const assignment = { id: doc.id, ...doc.data() } as Assignment;
      const volunteer = volunteersMap.get(assignment.person_id);
      const service = assignment.service_id ? servicesMap.get(assignment.service_id) : null;

      if (!volunteer?.email) continue;

      // Phase 2: honor the volunteer's stored opt-out before generating
      // a confirmation token and queueing the email. We still issue the
      // confirm token + outbox entry when eligibility blocks, since the
      // confirm flow is the user's path to RE-enable themselves; we only
      // skip the actual send. Channel decision happens at send time below.
      const eligibility = eligibilityByAssignment.get(doc.id)!;

      const confirmToken = crypto.randomUUID();
      batch.update(doc.ref, { confirmation_token: confirmToken });

      const email = buildConfirmationEmail({
        volunteerName: volunteer.name,
        churchName,
        churchLogoUrl,
        serviceName: service?.name || "Service",
        ministryName: assignment.ministry_id,
        roleTitle: assignment.role_title,
        serviceDate: assignment.service_date,
        startTime: service?.start_time || "",
        confirmUrl: `${baseUrl}/confirm/${confirmToken}`,
      });

      if (!eligibility.email) continue;

      pendingEmails.push({
        assignmentDocRef: doc.ref,
        volunteerEmail: volunteer.email!,
        from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }

    // Commit confirm-token updates first so the email links work even if
    // sends fail and retry from the outbox later.
    await batch.commit();

    // Inline send pass — best effort, with outbox enqueue on failure.
    if (process.env.RESEND_API_KEY) {
      for (const p of pendingEmails) {
        try {
          const result = await resend.emails.send({
            from: p.from,
            to: [p.volunteerEmail],
            subject: p.subject,
            html: p.html,
            text: p.text,
          });
          if (result.error) {
            console.error("[publish] Resend error:", result.error);
            emailsFailed++;
            const fallbackBatch = adminDb.batch();
            enqueueOutboxEntry(fallbackBatch, {
              church_id,
              kind: "email",
              origin: "schedule.publish.retry",
              source_ref: p.assignmentDocRef.path,
              payload: {
                to: p.volunteerEmail,
                from: p.from,
                subject: p.subject,
                html: p.html,
                text: p.text,
              },
            });
            await fallbackBatch.commit();
            enqueuedRetries++;
          } else {
            emailsSent++;
          }
        } catch (err) {
          console.error("[publish] Email send threw:", err);
          emailsFailed++;
          const fallbackBatch = adminDb.batch();
          enqueueOutboxEntry(fallbackBatch, {
            church_id,
            kind: "email",
            origin: "schedule.publish.retry",
            source_ref: p.assignmentDocRef.path,
            payload: {
              to: p.volunteerEmail,
              from: p.from,
              subject: p.subject,
              html: p.html,
              text: p.text,
            },
          });
          await fallbackBatch.commit();
          enqueuedRetries++;
        }
      }
    } else {
      // No Resend key — enqueue all to outbox.
      for (const p of pendingEmails) {
        const fallbackBatch = adminDb.batch();
        enqueueOutboxEntry(fallbackBatch, {
          church_id,
          kind: "email",
          origin: "schedule.publish",
          source_ref: p.assignmentDocRef.path,
          payload: {
            to: p.volunteerEmail,
            from: p.from,
            subject: p.subject,
            html: p.html,
            text: p.text,
          },
        });
        await fallbackBatch.commit();
        enqueuedRetries++;
      }
    }

    void audit({
      church_id,
      actor: userActor(userId),
      action: "schedule.publish",
      target_type: "schedule",
      target_id: scheduleId,
      metadata: {
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
        emails_enqueued_for_retry: enqueuedRetries,
        assignments: assignSnap.docs.length,
      },
      outcome: emailsFailed > 0 ? "failed" : "ok",
    });

    return NextResponse.json({
      success: true,
      published_at: now,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      emails_enqueued_for_retry: enqueuedRetries,
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
