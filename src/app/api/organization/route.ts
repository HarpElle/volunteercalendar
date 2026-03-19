import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe";
import { buildOrgDeletedEmail, buildOrgDeletedMembersEmail } from "@/lib/utils/email-templates";
import { cascadeDeleteOrg } from "@/lib/utils/org-cascade-delete";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * DELETE /api/organization
 * Cascading delete of an organization and all its data.
 * Requires: owner role, confirmed with org name in body.
 */
export async function DELETE(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, confirm_name } = body;

    if (!church_id || !confirm_name) {
      return NextResponse.json(
        { error: "Missing church_id or confirm_name" },
        { status: 400 },
      );
    }

    // Verify the user is the owner of this org
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists || membershipSnap.data()?.role !== "owner") {
      return NextResponse.json(
        { error: "Only the organization owner can delete it" },
        { status: 403 },
      );
    }

    // Verify org exists and confirm_name matches
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const orgName = churchSnap.data()?.name || "";
    if (confirm_name !== orgName) {
      return NextResponse.json(
        { error: "Organization name does not match. Please type the exact name to confirm." },
        { status: 400 },
      );
    }

    // Cancel Stripe subscription if active
    const stripeCustomerId = churchSnap.data()?.stripe_customer_id;
    const stripeSubscriptionId = churchSnap.data()?.stripe_subscription_id;
    if (stripeCustomerId && stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch (err) {
        console.warn("Failed to cancel Stripe subscription:", err);
        // Continue with deletion even if Stripe fails
      }
    }

    // Collect member info BEFORE deletion for notification emails
    const membersSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", church_id)
      .where("status", "==", "active")
      .get();
    const memberNotifyList: Array<{ uid: string; email: string; name: string }> = [];
    for (const d of membersSnap.docs) {
      const uid = d.data()?.user_id;
      if (!uid || uid === userId) continue; // skip the owner (they get their own email)
      const userSnap = await adminDb.doc(`users/${uid}`).get();
      const email = userSnap.data()?.email;
      if (email) {
        memberNotifyList.push({ uid, email, name: userSnap.data()?.display_name || email });
      }
    }

    // Check if members have other orgs (for email content)
    const memberOtherOrgs = new Map<string, boolean>();
    for (const m of memberNotifyList) {
      const otherMems = await adminDb
        .collection("memberships")
        .where("user_id", "==", m.uid)
        .where("church_id", "!=", church_id)
        .limit(1)
        .get();
      memberOtherOrgs.set(m.uid, !otherMems.empty);
    }

    // Cascade-delete all org data (subcollections, memberships, signups, etc.)
    await cascadeDeleteOrg(adminDb, church_id);

    // Send notification emails (best-effort, don't block on failure)
    try {
      // Owner confirmation email
      const ownerEmail = decoded.email;
      const ownerProfile = await adminDb.doc(`users/${userId}`).get();
      const ownerName = ownerProfile.data()?.display_name || ownerEmail || "there";
      if (ownerEmail) {
        const { subject, html, text } = buildOrgDeletedEmail({
          userName: ownerName,
          orgName,
        });
        await resend.emails.send({
          from: "VolunteerCal <noreply@volunteercal.org>",
          to: ownerEmail,
          subject,
          html,
          text,
        });
      }

      // Notify all other members
      for (const m of memberNotifyList) {
        try {
          const { subject, html, text } = buildOrgDeletedMembersEmail({
            userName: m.name,
            orgName,
            hasOtherOrgs: memberOtherOrgs.get(m.uid) ?? false,
          });
          await resend.emails.send({
            from: "VolunteerCal <noreply@volunteercal.org>",
            to: m.email,
            subject,
            html,
            text,
          });
        } catch (memberEmailErr) {
          console.warn(`Failed to notify member ${m.uid}:`, memberEmailErr);
        }
      }
    } catch (emailErr) {
      console.warn("Failed to send org deletion emails:", emailErr);
    }

    return NextResponse.json({ success: true, message: "Organization deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("DELETE /api/organization error:", message, err);
    return NextResponse.json({ error: `Deletion failed: ${message}` }, { status: 500 });
  }
}
