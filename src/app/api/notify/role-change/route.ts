import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildRolePromotionEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

const ROLE_RANK: Record<string, number> = {
  volunteer: 0,
  scheduler: 1,
  admin: 2,
  owner: 3,
};

const ROLE_LABELS: Record<string, string> = {
  volunteer: "Volunteer",
  scheduler: "Scheduler",
  admin: "Admin",
  owner: "Owner",
};

/**
 * POST /api/notify/role-change
 * Sends promotion notification when a member's role is upgraded.
 * Only sends for promotions (not demotions).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authHeader.slice(7));

    const { membership_id, old_role, new_role, church_id } = await req.json();
    if (!membership_id || !old_role || !new_role || !church_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Only send email for promotions
    if ((ROLE_RANK[new_role] ?? 0) <= (ROLE_RANK[old_role] ?? 0)) {
      return NextResponse.json({ skipped: true, reason: "not a promotion" });
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

    const { subject, html, text } = buildRolePromotionEmail({
      userName,
      newRole: ROLE_LABELS[new_role] || new_role,
      churchName,
    });

    await resend.emails.send({
      from: "VolunteerCal <noreply@harpelle.com>",
      to: userEmail,
      subject,
      html,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("notify/role-change error:", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
