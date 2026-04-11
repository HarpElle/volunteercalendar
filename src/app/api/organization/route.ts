import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe";
import { buildOrgDeletedEmail, buildOrgDeletedMembersEmail } from "@/lib/utils/email-templates";
import { cascadeDeleteOrg } from "@/lib/utils/org-cascade-delete";
import { generateShortCode } from "@/lib/utils/short-code";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/organization
 * Create a new organization (church doc + owner membership + user profile link).
 * Uses Admin SDK so Firestore security rules are bypassed — works for both
 * first orgs (churchId === uid) and additional orgs (churchId === random UUID).
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

    const body = await req.json();
    const { name, org_type, timezone, workflow_mode } = body;

    if (!name || !org_type || !timezone || !workflow_mode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Determine churchId: first org uses uid, additional orgs use random UUID
    const existingMemberships = await adminDb
      .collection("memberships")
      .where("user_id", "==", userId)
      .where("status", "==", "active")
      .limit(1)
      .get();
    const hasExistingOrg = !existingMemberships.empty;
    const churchId = hasExistingOrg ? crypto.randomUUID() : userId;

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const now = new Date().toISOString();
    const shortCode = await generateShortCode();

    // Create church doc
    await adminDb.doc(`churches/${churchId}`).set({
      name,
      slug,
      short_code: shortCode,
      org_type,
      workflow_mode,
      timezone,
      subscription_tier: "free",
      stripe_customer_id: null,
      settings: {
        default_schedule_range_weeks: 4,
        default_reminder_channels: ["email"],
        require_confirmation: true,
      },
      created_at: now,
    });

    // Create owner membership
    const membershipId = `${userId}_${churchId}`;
    await adminDb.doc(`memberships/${membershipId}`).set({
      user_id: userId,
      church_id: churchId,
      role: "owner",
      ministry_scope: [],
      status: "active",
      invited_by: null,
      volunteer_id: null,
      reminder_preferences: { channels: ["email"] },
      created_at: now,
      updated_at: now,
    });

    // Create person record so owner appears on the scheduling roster
    const userSnap = await adminDb.doc(`users/${userId}`).get();
    const userData = userSnap.data() || {};
    const ownerName = (userData.display_name || decoded.name || decoded.email || "Owner") as string;
    const ownerEmail = (decoded.email || userData.email || "") as string;
    const nameParts = ownerName.split(" ");
    const volRef = adminDb.collection(`churches/${churchId}/people`).doc();
    await volRef.set({
      church_id: churchId,
      person_type: "adult",
      name: ownerName,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      search_name: ownerName.toLowerCase(),
      email: ownerEmail,
      phone: (userData.phone as string) || null,
      search_phones: [],
      photo_url: null,
      user_id: userId,
      membership_id: membershipId,
      status: "active",
      is_volunteer: true,
      ministry_ids: [],
      role_ids: [],
      campus_ids: [],
      household_ids: [],
      scheduling_profile: {
        blockout_dates: [],
        recurring_unavailable: [],
        preferred_frequency: 2,
        max_roles_per_month: 8,
      },
      reminder_preferences: { channels: ["email"] },
      stats: {
        times_scheduled_last_90d: 0,
        last_served_date: null,
        decline_count: 0,
        no_show_count: 0,
      },
      imported_from: null,
      created_at: now,
      updated_at: now,
    });

    // Link membership to volunteer record
    await adminDb.doc(`memberships/${membershipId}`).update({
      volunteer_id: volRef.id,
    });

    // Link user profile to this church
    await adminDb.doc(`users/${userId}`).update({
      church_id: churchId,
      default_church_id: churchId,
      role: "admin",
    });

    return NextResponse.json({ success: true, church_id: churchId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/organization error:", message, err);
    return NextResponse.json({ error: `Creation failed: ${message}` }, { status: 500 });
  }
}

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
          from: "VolunteerCal <noreply@harpelle.com>",
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
            from: "VolunteerCal <noreply@harpelle.com>",
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
