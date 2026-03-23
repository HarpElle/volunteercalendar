import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Resend } from "resend";
import { buildAssignmentChangeEmail } from "@/lib/utils/emails";
import { resolveUserId, createUserNotification } from "@/lib/services/user-notifications";

const resend = new Resend(process.env.RESEND_API_KEY);

interface ModifyBody {
  church_id: string;
  action: "remove" | "move";
  item_type: "assignment" | "event_signup";
  item_id: string;
  new_role_id?: string;
  new_role_title?: string;
  initiated_by_name: string;
}

/**
 * POST /api/roster/modify
 *
 * Remove or move a volunteer in an assignment or event signup.
 * Sends notification email to the affected volunteer.
 * Requires scheduler+ role for the relevant ministry.
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

    const body = (await req.json()) as ModifyBody;
    const { church_id, action, item_type, item_id, new_role_id, new_role_title, initiated_by_name } = body;

    if (!church_id || !action || !item_type || !item_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify membership + role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const membership = membershipSnap.data()!;
    const role = membership.role as string;
    const ministryScope = (membership.ministry_scope as string[]) || [];
    const isAdminOrOwner = role === "admin" || role === "owner";
    const isSchedulerRole = role === "scheduler" || isAdminOrOwner;

    if (!isSchedulerRole) {
      return NextResponse.json({ error: "Scheduler or above required" }, { status: 403 });
    }

    // Fetch the item
    let docRef;
    let itemData: Record<string, unknown>;
    let volunteerId: string;
    let ministryId: string;
    let serviceName = "Service";
    let serviceDate = "";
    let oldRoleTitle = "";

    if (item_type === "assignment") {
      docRef = adminDb.doc(`churches/${church_id}/assignments/${item_id}`);
      const snap = await docRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      itemData = snap.data()!;
      volunteerId = itemData.volunteer_id as string;
      ministryId = itemData.ministry_id as string;
      oldRoleTitle = itemData.role_title as string;
      serviceDate = itemData.service_date as string;

      // Check ministry scope for schedulers
      if (!isAdminOrOwner && ministryScope.length > 0 && !ministryScope.includes(ministryId)) {
        return NextResponse.json({ error: "Not authorized for this ministry" }, { status: 403 });
      }

      // Get service name
      if (itemData.service_id) {
        const svcSnap = await adminDb.doc(`churches/${church_id}/services/${itemData.service_id}`).get();
        if (svcSnap.exists) serviceName = (svcSnap.data()!.name as string) || serviceName;
      }
    } else {
      docRef = adminDb.doc(`event_signups/${item_id}`);
      const snap = await docRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Signup not found" }, { status: 404 });
      }
      itemData = snap.data()!;
      if (itemData.church_id !== church_id) {
        return NextResponse.json({ error: "Signup does not belong to this organization" }, { status: 403 });
      }
      volunteerId = itemData.volunteer_id as string;
      ministryId = ""; // events don't have a single ministry
      oldRoleTitle = itemData.role_title as string;

      // Get event info for name + date
      if (itemData.event_id) {
        const evtSnap = await adminDb.doc(`churches/${church_id}/events/${itemData.event_id}`).get();
        if (evtSnap.exists) {
          const evt = evtSnap.data()!;
          serviceName = (evt.name as string) || "Event";
          serviceDate = (evt.date as string) || "";

          // Check ministry scope for schedulers on events
          if (!isAdminOrOwner && ministryScope.length > 0) {
            const evtMinistries = (evt.ministry_ids as string[]) || [];
            if (!evtMinistries.some((mid: string) => ministryScope.includes(mid))) {
              return NextResponse.json({ error: "Not authorized for this event" }, { status: 403 });
            }
          }
        }
      }
    }

    // Perform the action
    if (action === "remove") {
      if (item_type === "assignment") {
        await docRef.update({ status: "declined", responded_at: new Date().toISOString() });
      } else {
        await docRef.update({ status: "cancelled" });
      }
    } else if (action === "move") {
      if (!new_role_id || !new_role_title) {
        return NextResponse.json({ error: "new_role_id and new_role_title required for move" }, { status: 400 });
      }
      await docRef.update({ role_id: new_role_id, role_title: new_role_title });
    }

    // Send notification to the affected volunteer
    const volSnap = await adminDb.doc(`churches/${church_id}/volunteers/${volunteerId}`).get();
    const volData = volSnap.exists ? volSnap.data()! : null;
    const volEmail = (volData?.email as string) || null;
    const volName = (volData?.name as string) || "Volunteer";

    // Get church name for email
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchName = churchSnap.exists ? (churchSnap.data()!.name as string) || "Your Organization" : "Your Organization";

    if (volEmail) {
      const email = buildAssignmentChangeEmail({
        volunteerName: volName,
        churchName,
        action: action === "remove" ? "removed" : "moved",
        serviceName,
        serviceDate,
        oldRole: oldRoleTitle,
        newRole: new_role_title,
        changedByName: initiated_by_name,
      });

      await resend.emails.send({
        from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
        to: volEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }

    // Fire-and-forget: create in-app assignment change notification
    try {
      const modifyUserId = await resolveUserId(church_id, volunteerId);
      if (modifyUserId) {
        const notifBody = action === "remove"
          ? `You were removed from ${oldRoleTitle} on ${serviceDate}`
          : `Your role was changed for ${serviceDate}`;

        await createUserNotification({
          user_id: modifyUserId,
          church_id,
          type: "assignment_change",
          title: "Your schedule was updated",
          body: notifBody,
          metadata: { link_href: "/dashboard/my-schedule" },
        });
      }
    } catch (notifErr) {
      console.error("User notification error (roster modify):", notifErr);
    }

    return NextResponse.json({
      success: true,
      action,
      volunteer_name: volName,
      notified: !!volEmail,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
