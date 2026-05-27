import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe";
import { buildOrgDeletedEmail, buildOrgDeletedMembersEmail } from "@/lib/utils/email-templates";
import { cascadeDeleteOrg } from "@/lib/utils/org-cascade-delete";
import { audit, userActor } from "@/lib/server/audit";
import { generateShortCode } from "@/lib/utils/short-code";
import { resend } from "@/lib/resend";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import {
  FREE_ORG_CAP_PER_EMAIL,
  ORG_CREATION_PER_IP_PER_DAY,
  isBetaTester,
  isBetaTesterEmail,
} from "@/lib/server/abuse-caps";
import { requireUser, requireMembership } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import { log } from "@/lib/log";

const CreateBodySchema = z.object({
  name: z.string().min(1),
  org_type: z.string().min(1),
  timezone: z.string().min(1),
  workflow_mode: z.string().min(1),
});

const DeleteBodySchema = z.object({
  church_id: z.string().min(1),
  confirm_name: z.string().min(1),
});

/**
 * POST /api/organization
 * Create a new organization (church doc + owner membership + user profile link).
 * Uses Admin SDK so Firestore security rules are bypassed — works for both
 * first orgs (churchId === uid) and additional orgs (churchId === random UUID).
 */
export async function POST(req: NextRequest) {
  // Auth first — we need uid + email for rate-limiting + abuse caps even
  // before reading the body. parseBody runs after so caller doesn't see
  // a 400 leak about body shape if they're unauthenticated.
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody(req, CreateBodySchema);
  if (body instanceof NextResponse) return body;

  const userId = auth.uid;
  const callerEmail = auth.email;

  try {
    const { name, org_type, timezone, workflow_mode } = body;

    // Pass G Phase 5: per-IP throttle on org creation. Catches IP-rotating
    // scripted multiplication. Beta-testers exempt.
    const isExempt =
      isBetaTester(userId) || isBetaTesterEmail(callerEmail);
    if (!isExempt) {
      const ipLimited = await rateLimitDistributed(req, {
        prefix: "org-create-ip",
        limit: ORG_CREATION_PER_IP_PER_DAY,
        windowSeconds: 24 * 60 * 60,
      });
      if (ipLimited) return ipLimited;
    }

    // Pass G Phase 5: anti-multiplication cap. Count this user's existing
    // active OWNER memberships on Free-tier churches. If at the cap, refuse
    // to create another Free org. Once a user upgrades an existing org
    // their remaining Free budget is unchanged (intent: prevent abusing
    // the Free tier as a way to multiply limits across many "shell" orgs).
    const existingMemberships = await adminDb
      .collection("memberships")
      .where("user_id", "==", userId)
      .where("status", "==", "active")
      .get();
    const hasExistingOrg = !existingMemberships.empty;
    if (!isExempt && hasExistingOrg) {
      const ownedFreeChurchIds: string[] = [];
      for (const memDoc of existingMemberships.docs) {
        if ((memDoc.data().role as string) !== "owner") continue;
        const ownedChurchId = memDoc.data().church_id as string;
        const churchSnap = await adminDb
          .doc(`churches/${ownedChurchId}`)
          .get();
        if (!churchSnap.exists) continue;
        const tier = (churchSnap.data()?.subscription_tier as string) || "free";
        if (tier === "free") ownedFreeChurchIds.push(ownedChurchId);
      }
      if (ownedFreeChurchIds.length >= FREE_ORG_CAP_PER_EMAIL) {
        return NextResponse.json(
          {
            error: `You already own ${ownedFreeChurchIds.length} Free organizations (cap is ${FREE_ORG_CAP_PER_EMAIL}). Upgrade an existing organization to add more, or contact support if you have a legitimate need for additional Free orgs.`,
            cap: FREE_ORG_CAP_PER_EMAIL,
            current_count: ownedFreeChurchIds.length,
          },
          { status: 403 },
        );
      }
    }

    // Determine churchId: first org uses uid, additional orgs use random UUID
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
    const ownerName = (userData.display_name || auth.claims.name || auth.email || "Owner") as string;
    const ownerEmail = (auth.email || userData.email || "") as string;
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
    log.error("POST /api/organization failed", { error: err, user_id: userId });
    return NextResponse.json({ error: `Creation failed: ${message}` }, { status: 500 });
  }
}

/**
 * DELETE /api/organization
 * Cascading delete of an organization and all its data.
 * Requires: owner role, confirmed with org name in body.
 */
export async function DELETE(req: NextRequest) {
  const body = await parseBody(req, DeleteBodySchema);
  if (body instanceof NextResponse) return body;

  // Owner-only gate. requireMembership 401s on missing token, 403s on
  // non-member or non-owner.
  const auth = await requireMembership(req, body.church_id, "owner");
  if (auth instanceof NextResponse) return auth;

  const { church_id, confirm_name } = body;
  const userId = auth.uid;

  try {
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

    // Audit BEFORE cascade so we capture the org name + member count before
    // they're gone. The audit log itself survives the cascade (separate
    // top-level collection).
    void audit({
      church_id,
      actor: userActor(userId),
      action: "org.delete",
      target_type: "church",
      target_id: church_id,
      metadata: {
        name: churchSnap.data()?.name as string | undefined,
        active_members: memberNotifyList.length + 1, // +1 for owner
        had_subscription: !!stripeSubscriptionId,
      },
      outcome: "ok",
    });

    // Cascade-delete all org data (subcollections, memberships, signups, etc.)
    await cascadeDeleteOrg(adminDb, church_id);

    // Send notification emails (best-effort, don't block on failure)
    try {
      // Owner confirmation email
      const ownerEmail = auth.email;
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
