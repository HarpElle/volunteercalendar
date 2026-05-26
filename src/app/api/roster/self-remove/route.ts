import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildSelfRemovalAlertEmail } from "@/lib/utils/emails";
import { shouldNotifyScheduler } from "@/lib/utils/scheduler-notification-check";
import { sendSms } from "@/lib/services/sms";
import type { Membership } from "@/lib/types";
import { createUserNotification } from "@/lib/services/user-notifications";
import { resend } from "@/lib/resend";

interface SelfRemoveBody {
  church_id: string;
  item_type: "assignment" | "event_signup";
  item_id: string;
  note?: string;
}

/**
 * POST /api/roster/self-remove
 *
 * Allows a volunteer to remove themselves from an assignment or event signup.
 * Sends notification to schedulers for the relevant ministry + all admins/owners.
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

    const body = (await req.json()) as SelfRemoveBody;
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

    // Fetch the item and verify ownership
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
        return NextResponse.json({ error: "You can only remove yourself" }, { status: 403 });
      }

      // Get service name
      if (data.service_id) {
        const svcSnap = await adminDb.doc(`churches/${church_id}/services/${data.service_id}`).get();
        if (svcSnap.exists) serviceName = (svcSnap.data()!.name as string) || serviceName;
      }

      // Mark as declined
      await docRef.update({ status: "declined", responded_at: new Date().toISOString() });
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
      // Codex Pass H Phase 6 sweep Sev 2 (2026-05-25): the new event_signup
      // shape (per Phase 4 PR #78) writes `volunteer_id`, but this route
      // previously read only `data.person_id`. Result: Alex got 403 "You
      // can only remove yourself" when cancelling his own newly-created
      // signup. Fix: read volunteer_id first, fall back to person_id for
      // any legacy doc that still uses the older field name.
      //
      // ALSO accept a user_id match (same identity-join pattern as
      // /api/calendar): legacy logged-in signups have `volunteer_id: ""`
      // and only carry `user_id`. Without this fallback those would still
      // 403 even after the field-name fix above.
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
        return NextResponse.json({ error: "You can only remove yourself" }, { status: 403 });
      }
      // For the downstream notification + audit lookups (volunteer name)
      // we need a non-empty volunteerId. If the legacy path matched only
      // by user_id, resolve the Person from the membership so the email
      // still names the right volunteer.
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

      // Mark as cancelled
      await docRef.update({ status: "cancelled" });
    }

    // Get volunteer name
    const volSnap = await adminDb.doc(`churches/${church_id}/people/${volunteerId}`).get();
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
      if (mUserId === userId) continue; // Don't notify the person who removed themselves

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
        "self_removal",
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
        const email = buildSelfRemovalAlertEmail({
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
        const smsText = `VolunteerCal: ${volunteerName} removed themselves from ${roleName} (${serviceName}) on ${serviceDate}. Check your dashboard.`;
        try {
          await sendSms({ to: recipientPhone, body: smsText });
          smsCount++;
        } catch {
          // continue
        }
      }

      // Fire-and-forget: in-app self-removal alert notification for scheduler
      try {
        await createUserNotification({
          user_id: mUserId,
          church_id,
          type: "self_removal_alert",
          title: `${volunteerName} removed themselves`,
          body: `${roleName} on ${serviceDate}`,
          metadata: { link_href: "/dashboard/schedules" },
        });
      } catch (notifErr) {
        console.error("Self-removal alert user notification failed:", notifErr);
      }
    }

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
