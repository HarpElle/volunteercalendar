import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe";

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
    const batch = adminDb.batch();
    let deleteCount = 0;

    for (const collection of SUBCOLLECTIONS) {
      const snap = await adminDb.collection(`churches/${church_id}/${collection}`).get();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        deleteCount++;
        // Firestore batches max at 500 operations
        if (deleteCount >= 490) {
          await batch.commit();
          deleteCount = 0;
        }
      }
    }

    // Delete all memberships for this church
    const membershipsSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", church_id)
      .get();
    for (const doc of membershipsSnap.docs) {
      batch.delete(doc.ref);
      deleteCount++;
      if (deleteCount >= 490) {
        await batch.commit();
        deleteCount = 0;
      }
    }

    // Delete all event_signups for this church
    const signupsSnap = await adminDb
      .collection("event_signups")
      .where("church_id", "==", church_id)
      .get();
    for (const doc of signupsSnap.docs) {
      batch.delete(doc.ref);
      deleteCount++;
      if (deleteCount >= 490) {
        await batch.commit();
        deleteCount = 0;
      }
    }

    // Delete all short_links for this church
    const shortLinksSnap = await adminDb
      .collection("short_links")
      .where("church_id", "==", church_id)
      .get();
    for (const doc of shortLinksSnap.docs) {
      batch.delete(doc.ref);
      deleteCount++;
      if (deleteCount >= 490) {
        await batch.commit();
        deleteCount = 0;
      }
    }

    // Delete the church document itself
    batch.delete(adminDb.doc(`churches/${church_id}`));

    // Commit remaining
    if (deleteCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, message: "Organization deleted" });
  } catch (err) {
    console.error("DELETE /api/organization error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
