import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildWelcomeToOrgEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/notify/welcome-to-org
 * Sends welcome email when a volunteer self-registers via join link.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { church_id, role } = await req.json();
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const [userSnap, churchSnap] = await Promise.all([
      adminDb.doc(`users/${userId}`).get(),
      adminDb.doc(`churches/${church_id}`).get(),
    ]);

    const userEmail = userSnap.data()?.email || decoded.email;
    if (!userEmail) {
      return NextResponse.json({ error: "No email for user" }, { status: 400 });
    }

    const userName = userSnap.data()?.display_name || userEmail;
    const churchName = churchSnap.data()?.name || "your organization";

    const { subject, html, text } = buildWelcomeToOrgEmail({
      userName,
      churchName,
      isPending: true,
      role: role || "Volunteer",
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
    console.error("notify/welcome-to-org error:", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
