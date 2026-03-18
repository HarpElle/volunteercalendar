import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe";
import { buildOrgDeletedEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

const SUBCOLLECTIONS = [
  "volunteers",
  "ministries",
  "services",
  "events",
  "schedules",
  "assignments",
  "notifications",
  "integration_credentials",
];

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

    // Delete all subcollections under the church document
    // Firestore batches are single-use — create a new one after each commit.
    let batch = adminDb.batch();
    let deleteCount = 0;

    async function addDelete(ref: ReturnType<typeof adminDb.doc>) {
      batch.delete(ref);
      deleteCount++;
      if (deleteCount >= 490) {
        await batch.commit();
        batch = adminDb.batch();
        deleteCount = 0;
      }
    }

    for (const collection of SUBCOLLECTIONS) {
      const snap = await adminDb.collection(`churches/${church_id}/${collection}`).get();
      for (const d of snap.docs) {
        await addDelete(d.ref);
      }
    }

    // Delete all memberships for this church
    const membershipsSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", church_id)
      .get();
    for (const d of membershipsSnap.docs) {
      await addDelete(d.ref);
    }

    // Delete all event_signups for this church
    const signupsSnap = await adminDb
      .collection("event_signups")
      .where("church_id", "==", church_id)
      .get();
    for (const d of signupsSnap.docs) {
      await addDelete(d.ref);
    }

    // Delete all short_links for this church
    const shortLinksSnap = await adminDb
      .collection("short_links")
      .where("church_id", "==", church_id)
      .get();
    for (const d of shortLinksSnap.docs) {
      await addDelete(d.ref);
    }

    // Delete pending_invites for this church
    const pendingSnap = await adminDb
      .collection("pending_invites")
      .where("church_id", "==", church_id)
      .get();
    for (const d of pendingSnap.docs) {
      await addDelete(d.ref);
    }

    // Delete the church document itself
    await addDelete(adminDb.doc(`churches/${church_id}`));

    // Commit remaining
    if (deleteCount > 0) {
      await batch.commit();
    }

    // Clear church_id / default_church_id from all affected user profiles
    // so they don't get stuck pointing at a deleted org.
    const affectedUserIds = new Set<string>();
    for (const d of membershipsSnap.docs) {
      const uid = d.data()?.user_id;
      if (uid) affectedUserIds.add(uid);
    }
    // Always include the requesting user
    affectedUserIds.add(userId);

    const profileBatch = adminDb.batch();
    for (const uid of affectedUserIds) {
      const userRef = adminDb.doc(`users/${uid}`);
      const userSnap = await userRef.get();
      if (!userSnap.exists) continue;
      const data = userSnap.data() || {};
      const updates: Record<string, unknown> = {};
      if (data.church_id === church_id) updates.church_id = null;
      if (data.default_church_id === church_id) updates.default_church_id = null;
      if (Object.keys(updates).length > 0) {
        profileBatch.update(userRef, updates);
      }
    }
    await profileBatch.commit();

    // Send confirmation email to the owner (best-effort, don't block on failure)
    try {
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
    } catch (emailErr) {
      console.warn("Failed to send org deletion confirmation email:", emailErr);
    }

    return NextResponse.json({ success: true, message: "Organization deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("DELETE /api/organization error:", message, err);
    return NextResponse.json({ error: `Deletion failed: ${message}` }, { status: 500 });
  }
}
