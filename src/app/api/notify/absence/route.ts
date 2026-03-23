import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Resend } from "resend";
import { buildAbsenceAlertEmail } from "@/lib/utils/emails/absence-alert";
import { sendSms } from "@/lib/services/sms";
import { shouldNotifyScheduler } from "@/lib/utils/scheduler-notification-check";
import type { Membership } from "@/lib/types";
import { createUserNotification } from "@/lib/services/user-notifications";

const resend = new Resend(process.env.RESEND_API_KEY);

interface AbsenceBody {
  church_id: string;
  item_type: "assignment" | "event_signup";
  item_id: string;
  note?: string;
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
      volunteerId = data.volunteer_id as string;
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
      volunteerId = data.volunteer_id as string;
      roleName = data.role_title as string;

      if (volunteerId !== userVolunteerId) {
        return NextResponse.json({ error: "You can only notify for your own signups" }, { status: 403 });
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
    const volSnap = await adminDb.doc(`churches/${church_id}/volunteers/${volunteerId}`).get();
    const volunteerName = volSnap.exists ? (volSnap.data()!.name as string) || "Volunteer" : "Volunteer";

    // Get church name + tier
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchData = churchSnap.exists ? churchSnap.data()! : {};
    const churchName = (churchData.name as string) || "Organization";
    const subscriptionTier = (churchData.subscription_tier as string) || "free";

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

      // Check scheduler notification preferences
      const membershipAsType = { id: mDoc.id, ...mData } as Membership;
      const { email: sendEmail, sms: sendSmsFlag } = shouldNotifyScheduler(
        membershipAsType,
        "absence_alert",
        subscriptionTier,
      );

      if (!sendEmail && !sendSmsFlag) continue;

      // Get recipient profile
      const profileSnap = await adminDb.doc(`users/${mUserId}`).get();
      if (!profileSnap.exists) continue;
      const profileData = profileSnap.data()!;
      const recipientEmail = profileData.email as string;
      const recipientName = (profileData.display_name as string) || "there";
      const recipientPhone = (profileData.phone as string) || null;

      // Send email
      if (sendEmail && recipientEmail) {
        const email = buildAbsenceAlertEmail({
          recipientName,
          volunteerName,
          churchName,
          serviceName,
          serviceDate,
          roleName,
          note: note || null,
        });

        try {
          await resend.emails.send({
            from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
            to: recipientEmail,
            subject: email.subject,
            html: email.html,
            text: email.text,
          });
          emailCount++;
        } catch {
          // continue notifying others
        }
      }

      // Send SMS if preferences allow and recipient has a phone number
      if (sendSmsFlag && recipientPhone) {
        const smsText = `VolunteerCal: ${volunteerName} can't make it for ${roleName} (${serviceName}) on ${serviceDate}. Check your dashboard.`;
        try {
          await sendSms({ to: recipientPhone, body: smsText });
          smsCount++;
        } catch {
          // continue
        }
      }

      // Fire-and-forget: in-app absence alert notification for scheduler
      try {
        await createUserNotification({
          user_id: mUserId,
          church_id,
          type: "absence_alert",
          title: `${volunteerName} can't make it`,
          body: `${roleName} on ${serviceDate}`,
          metadata: { link_href: "/dashboard/schedules" },
        });
      } catch (notifErr) {
        console.error("Absence alert user notification failed:", notifErr);
      }
    }

    // Log notification
    await adminDb.collection("sent_notifications").add({
      church_id,
      volunteer_id: volunteerId,
      volunteer_name: volunteerName,
      type: "absence_alert",
      channel: "email",
      status: "sent",
      error_message: null,
      external_id: null,
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      emails_sent: emailCount,
      sms_sent: smsCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
