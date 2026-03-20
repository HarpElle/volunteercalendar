import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Resend } from "resend";
import { buildSelfRemovalAlertEmail } from "@/lib/utils/emails";

const resend = new Resend(process.env.RESEND_API_KEY);

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
      volunteerId = data.volunteer_id as string;
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
      volunteerId = data.volunteer_id as string;
      roleName = data.role_title as string;

      if (volunteerId !== userVolunteerId) {
        return NextResponse.json({ error: "You can only remove yourself" }, { status: 403 });
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
    const volSnap = await adminDb.doc(`churches/${church_id}/volunteers/${volunteerId}`).get();
    const volunteerName = volSnap.exists ? (volSnap.data()!.name as string) || "Volunteer" : "Volunteer";

    // Get church name
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchName = churchSnap.exists ? (churchSnap.data()!.name as string) || "Organization" : "Organization";

    // Find notification recipients: schedulers for this ministry + all admins/owners
    const membershipsSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", church_id)
      .where("status", "==", "active")
      .get();

    const recipientUserIds: string[] = [];
    for (const mDoc of membershipsSnap.docs) {
      const mData = mDoc.data();
      const mRole = mData.role as string;
      const mUserId = mData.user_id as string;
      if (mUserId === userId) continue; // Don't notify the person who removed themselves

      if (mRole === "admin" || mRole === "owner") {
        recipientUserIds.push(mUserId);
      } else if (mRole === "scheduler" && ministryId) {
        const scope = (mData.ministry_scope as string[]) || [];
        if (scope.length === 0 || scope.includes(ministryId)) {
          recipientUserIds.push(mUserId);
        }
      }
    }

    // Get user profiles for email addresses
    let notifiedCount = 0;
    for (const recipientUserId of recipientUserIds) {
      const profileSnap = await adminDb.doc(`users/${recipientUserId}`).get();
      if (!profileSnap.exists) continue;
      const profileData = profileSnap.data()!;
      const recipientEmail = profileData.email as string;
      const recipientName = (profileData.display_name as string) || "there";

      if (!recipientEmail) continue;

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
        notifiedCount++;
      } catch {
        // continue notifying others
      }
    }

    return NextResponse.json({
      success: true,
      notified: notifiedCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
