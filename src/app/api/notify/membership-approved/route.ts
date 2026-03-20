import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildMembershipApprovedEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/notify/membership-approved
 * Sends approval notification to a member whose join request was approved.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authHeader.slice(7));

    const { membership_id, church_id } = await req.json();
    if (!membership_id || !church_id) {
      return NextResponse.json({ error: "Missing membership_id or church_id" }, { status: 400 });
    }

    const membershipSnap = await adminDb.doc(`memberships/${membership_id}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    const userId = membershipSnap.data()?.user_id;
    if (!userId) {
      return NextResponse.json({ error: "No user_id on membership" }, { status: 400 });
    }

    const [userSnap, churchSnap] = await Promise.all([
      adminDb.doc(`users/${userId}`).get(),
      adminDb.doc(`churches/${church_id}`).get(),
    ]);

    const userEmail = userSnap.data()?.email;
    if (!userEmail) {
      return NextResponse.json({ error: "No email for user" }, { status: 400 });
    }

    const userName = userSnap.data()?.display_name || userEmail;
    const churchName = churchSnap.data()?.name || "your organization";

    const { subject, html, text } = buildMembershipApprovedEmail({
      userName,
      churchName,
      dashboardUrl: "https://volunteercal.org/dashboard",
    });

    await resend.emails.send({
      from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
      to: userEmail,
      subject,
      html,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("notify/membership-approved error:", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
