import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/notify/facility-invite
 *
 * Sends email to all admins of the target org notifying them of a
 * facility group invitation.
 *
 * Body: { church_id, target_church_id, facility_group_id, facility_group_name }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { church_id, target_church_id, facility_group_id, facility_group_name } =
      await req.json();

    if (!church_id || !target_church_id || !facility_group_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify caller is admin/owner of inviting org
    const membershipId = `${userId}_${church_id}`;
    const callerMembership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (
      !callerMembership.exists ||
      !["owner", "admin"].includes(callerMembership.data()?.role)
    ) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get inviting org name
    const invitingChurchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const invitingOrgName = invitingChurchSnap.data()?.name || "An organization";

    // Find all admin/owner memberships of the target org
    const targetMembersSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", target_church_id)
      .where("role", "in", ["owner", "admin"])
      .where("status", "==", "active")
      .get();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://volunteercal.org";
    let sentCount = 0;

    for (const memberDoc of targetMembersSnap.docs) {
      const memberUserId = memberDoc.data().user_id;
      const userSnap = await adminDb.doc(`users/${memberUserId}`).get();
      const email = userSnap.data()?.email;
      if (!email) continue;

      const userName = userSnap.data()?.display_name || email;

      await resend.emails.send({
        from: `VolunteerCal <noreply@harpelle.com>`,
        to: email,
        subject: `Facility sharing invitation from ${invitingOrgName}`,
        html: `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2D3047;">Shared Facility Invitation</h2>
            <p>Hi ${userName},</p>
            <p><strong>${invitingOrgName}</strong> has invited your organization to join the
            facility group <strong>${facility_group_name || "Shared Facility"}</strong>.</p>
            <p>When you accept, both organizations will be able to see each other's room
            reservations — helping prevent double-bookings and coordination issues for
            shared spaces.</p>
            <p>
              <a href="${baseUrl}/dashboard/org/campuses"
                 style="display: inline-block; background: #E07A5F; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Review Invitation
              </a>
            </p>
            <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">
              You can accept or decline this invitation in Organization &rarr; Campuses.
            </p>
          </div>
        `,
        text: `${invitingOrgName} has invited your organization to join the facility group "${facility_group_name || "Shared Facility"}". Review the invitation at ${baseUrl}/dashboard/org/campuses`,
      });
      sentCount++;
    }

    return NextResponse.json({ sent: sentCount });
  } catch (err) {
    console.error("Facility invite notification error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
