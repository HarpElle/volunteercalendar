import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildAbsenceAlertEmail } from "@/lib/utils/emails/absence-alert";
import { sendSms } from "@/lib/services/sms";
import { resolveSchedulerEligibility } from "@/lib/server/notification-eligibility";
import { createUserNotification } from "@/lib/services/user-notifications";
import { resend } from "@/lib/resend";
import { log } from "@/lib/log";
import { audit, userActor } from "@/lib/server/audit";

interface AbsenceBody {
  church_id: string;
  item_type: "assignment" | "event_signup";
  item_id: string;
  note?: string;
  /**
   * Wave 12 B: client signals this is a day-of emergency (sick,
   * flat tire, etc.). When true, SMS + email bypass each
   * recipient's notification preferences so the news lands in time
   * for the church to react. Default false preserves the original
   * advance-notice behavior.
   */
  urgent?: boolean;
}

/**
 * POST /api/notify/absence
 *
 * Allows a volunteer to notify their scheduler(s) that they can't make it.
 * Marks the assignment as "excused" and sends email + optional SMS alerts
 * to relevant schedulers and admins.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = (await req.json()) as AbsenceBody;
    const { church_id, item_type, item_id, note } = body;
    const urgent = body.urgent === true;

    if (!church_id || !item_type || !item_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify user membership
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const membership = membershipSnap.data()!;
    const userVolunteerId = membership.volunteer_id as string;

    // Fetch item and verify ownership
    let volunteerId: string;
    let ministryId = "";
    let roleName = "";
    let serviceName = "Service";
    let serviceDate = "";

    if (item_type === "assignment") {
      const docRef = adminDb.doc(`churches/${church_id}/assignments/${item_id}`);
      const snap = await docRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      const data = snap.data()!;
      volunteerId = data.person_id as string;
      ministryId = data.ministry_id as string;
      roleName = data.role_title as string;
      serviceDate = data.service_date as string;

      if (volunteerId !== userVolunteerId) {
        return NextResponse.json({ error: "You can only notify for your own assignments" }, { status: 403 });
      }

      // Get service name
      if (data.service_id) {
        const svcSnap = await adminDb.doc(`churches/${church_id}/services/${data.service_id}`).get();
        if (svcSnap.exists) serviceName = (svcSnap.data()!.name as string) || serviceName;
      }

      // Mark as excused
      await docRef.update({
        attended: "excused",
        attended_at: new Date().toISOString(),
      });
    } else {
      const docRef = adminDb.doc(`event_signups/${item_id}`);
      const snap = await docRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Signup not found" }, { status: 404 });
      }
      const data = snap.data()!;
      if (data.church_id !== church_id) {
        return NextResponse.json({ error: "Signup does not belong to this organization" }, { status: 403 });
      }
      // Pass H Phase 6 audit follow-up (2026-05-25): mirror the
      // self-remove identity-join fix. event_signups carry
      // `volunteer_id` (new shape per Phase 4 PR #78), not
      // `person_id`. Without this the volunteer's "can't make it"
      // button 403'd for every signup they made through the
      // authenticated public flow.
      const signupVolunteerId =
        (data.volunteer_id as string | undefined) ||
        (data.person_id as string | undefined) ||
        "";
      const signupUserId = data.user_id as string | undefined;
      volunteerId = signupVolunteerId;
      roleName = data.role_title as string;

      const matchesVolunteer =
        signupVolunteerId !== "" && signupVolunteerId === userVolunteerId;
      const matchesUser = signupUserId !== undefined && signupUserId === userId;
      if (!matchesVolunteer && !matchesUser) {
        return NextResponse.json({ error: "You can only notify for your own signups" }, { status: 403 });
      }
      // Backfill volunteerId from membership when the legacy user_id
      // path matched, so the notification email below names the right
      // volunteer (same logic as self-remove).
      if (!matchesVolunteer && matchesUser && userVolunteerId) {
        volunteerId = userVolunteerId;
      }

      // Get event name + date
      if (data.event_id) {
        const evtSnap = await adminDb.doc(`churches/${church_id}/events/${data.event_id}`).get();
        if (evtSnap.exists) {
          const evt = evtSnap.data()!;
          serviceName = (evt.name as string) || "Event";
          serviceDate = (evt.date as string) || "";
          const evtMinistries = (evt.ministry_ids as string[]) || [];
          if (evtMinistries.length > 0) ministryId = evtMinistries[0];
        }
      }

      // Mark as excused
      await docRef.update({
        attended: "excused",
        attended_at: new Date().toISOString(),
      });
    }

    // Get volunteer name
    const volSnap = await adminDb.doc(`churches/${church_id}/people/${volunteerId}`).get();
    const volunteerName = volSnap.exists ? (volSnap.data()!.name as string) || "Volunteer" : "Volunteer";

    // Get church name. Subscription tier is now read inside the
    // notification-eligibility resolver, so we no longer carry it
    // through here.
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchData = churchSnap.exists ? churchSnap.data()! : {};
    const churchName = (churchData.name as string) || "Organization";
    // W11-C: church logo for email header. Null/undefined = template
    // falls back to the existing text-only header.
    const churchLogoUrl =
      (churchData.logo_url as string | null | undefined) ?? null;

    // Find notification recipients: schedulers for this ministry + all admins/owners
    const membershipsSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", church_id)
      .where("status", "==", "active")
      .get();

    let emailCount = 0;
    let smsCount = 0;

    for (const mDoc of membershipsSnap.docs) {
      const mData = mDoc.data();
      const mRole = mData.role as string;
      const mUserId = mData.user_id as string;
      if (mUserId === userId) continue; // Don't notify the volunteer themselves

      let isRecipient = false;
      if (mRole === "admin" || mRole === "owner") {
        isRecipient = true;
      } else if (mRole === "scheduler" && ministryId) {
        const scope = (mData.ministry_scope as string[]) || [];
        if (scope.length === 0 || scope.includes(ministryId)) {
          isRecipient = true;
        }
      }

      if (!isRecipient) continue;

      // Get recipient profile up front — we need to know whether
      // they have email/phone on file before we can decide channels.
      const profileSnap = await adminDb.doc(`users/${mUserId}`).get();
      if (!profileSnap.exists) continue;
      const profileData = profileSnap.data()!;
      const recipientEmail = (profileData.email as string) || "";
      const recipientName = (profileData.display_name as string) || "there";
      const recipientPhone = (profileData.phone as string) || "";

      // Phase 2: route eligibility through the shared resolver so
      // org-pause + membership-status get checked alongside scheduler
      // prefs. resolveSchedulerEligibility internally calls
      // shouldNotifyScheduler when urgent=false (preserving the
      // W12-B contract); when urgent=true it bypasses per-user prefs
      // (also W12-B) but still respects org-pause and membership status.
      // decideAbsenceChannels then layers the urgent-overrides-prefs
      // + has-channel logic on top — the test in
      // tests/unit/absence-channels.test.ts locks that contract.
      const eligibility = await resolveSchedulerEligibility({
        churchId: church_id,
        userId: mUserId,
        notificationType: "absence_alert",
        urgent,
      });

      // Codex 2026-06-23 retest #2 fix: the W12-B urgent-overrides-prefs
      // contract is now encoded INSIDE the resolver — when urgent=true
      // and the org gate / membership are healthy, decideSchedulerVerdict
      // returns email=true, sms=true, inApp=true. When the org is in
      // in_app_only mode, the resolver returns email=false, sms=false,
      // inApp=true regardless of urgency, which is the correct precedence
      // (org state is structural; urgent is a per-user bypass).
      //
      // Previously this site called decideAbsenceChannels(urgent, prefs)
      // ON TOP of the resolver — but decideAbsenceChannels honors urgent
      // by IGNORING prefsEmail/prefsSms and sending if contact info
      // exists. That re-promoted org_in_app_only's email/SMS back to
      // ON, breaking the org-level suppression. The fix: trust the
      // resolver. Layer only the has-contact-info check on top.
      const sendEmail = eligibility.email && !!recipientEmail;
      const sendSmsFlag = eligibility.sms && !!recipientPhone;

      if (!sendEmail && !sendSmsFlag && !eligibility.inApp) continue;

      // Send email
      if (sendEmail && recipientEmail) {
        const baseEmail = buildAbsenceAlertEmail({
          recipientName,
          volunteerName,
          churchName,
          churchLogoUrl,
          serviceName,
          serviceDate,
          roleName,
          note: note || null,
        });

        // W12-B: urgent path prefixes the subject so the message
        // jumps out in a crowded inbox. Body HTML/text are unchanged
        // — the subject + the SMS that lands at the same time carry
        // the urgency signal.
        const subject = urgent
          ? `URGENT — ${volunteerName} can’t make it TODAY (${roleName})`
          : baseEmail.subject;

        try {
          await resend.emails.send({
            from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
            to: recipientEmail,
            subject,
            html: baseEmail.html,
            text: baseEmail.text,
          });
          emailCount++;
        } catch {
          // continue notifying others
        }
      }

      // Send SMS. Body differs by mode — urgent leads with the word
      // "URGENT" so the recipient's phone preview makes it obvious.
      if (sendSmsFlag && recipientPhone) {
        const smsText = urgent
          ? `URGENT — VolunteerCal: ${volunteerName} CAN'T MAKE IT TODAY for ${roleName} (${serviceName}). Reach out / find a sub ASAP.`
          : `VolunteerCal: ${volunteerName} can't make it for ${roleName} (${serviceName}) on ${serviceDate}. Check your dashboard.`;
        try {
          await sendSms({ to: recipientPhone, body: smsText });
          smsCount++;
        } catch {
          // continue
        }
      }

      // Fire-and-forget: in-app absence alert notification for scheduler.
      // Gate on eligibility.inApp so deactivated schedulers and explicit
      // opt-outs don't accumulate inbox noise. In `org_in_app_only` mode
      // this is the ONLY channel that fires.
      if (eligibility.inApp) {
        try {
          await createUserNotification({
            user_id: mUserId,
            church_id,
            type: "absence_alert",
            title: urgent
              ? `URGENT: ${volunteerName} can't make it today`
              : `${volunteerName} can't make it`,
            body: urgent
              ? `${roleName} TODAY (${serviceDate}). Find a sub ASAP.`
              : `${roleName} on ${serviceDate}`,
            metadata: { link_href: "/dashboard/schedules" },
          });
        } catch (notifErr) {
          log.error("Absence alert user notification failed", { error: notifErr });
        }
      }
    }

    // Log notification
    await adminDb.collection("sent_notifications").add({
      church_id,
      volunteer_id: volunteerId,
      volunteer_name: volunteerName,
      type: urgent ? "urgent_absence_alert" : "absence_alert",
      channel: "email",
      status: "sent",
      error_message: null,
      external_id: null,
      sent_at: new Date().toISOString(),
    });

    // W12-B: audit the urgent path — material because (a) it
    // overrides recipient prefs and (b) churches want a queryable
    // signal for how often day-of absences happen. Non-urgent path
    // remains un-audited to keep the volume sane.
    if (urgent) {
      void audit({
        church_id,
        actor: userActor(userId),
        action: "volunteer.urgent_absence_alerted",
        target_type: item_type,
        target_id: item_id,
        metadata: {
          ministry_id: ministryId || null,
          volunteer_id: volunteerId,
          service_date: serviceDate,
          emails_sent: emailCount,
          sms_sent: smsCount,
          note: note ? note.slice(0, 200) : null,
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      success: true,
      emails_sent: emailCount,
      sms_sent: smsCount,
      urgent,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
