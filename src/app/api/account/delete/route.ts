import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { cascadeDeleteOrg } from "@/lib/utils/org-cascade-delete";
import {
  buildAccountDeletedEmail,
  buildVacancyAlertEmail,
  buildAdminDepartureEmail,
} from "@/lib/utils/email-templates";
import { stripe } from "@/lib/stripe";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SoleAdminOrg {
  id: string;
  name: string;
}

/**
 * DELETE /api/account/delete
 *
 * Server-side account deletion with pre-checks:
 *   1. Detects sole-admin orgs and warns (409) unless `confirm_delete_orgs` is set
 *   2. Cascade-deletes sole-admin orgs
 *   3. Removes user memberships from other orgs
 *   4. Deletes user profile + Firebase Auth account
 *   5. Sends farewell email
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

    const body = await req.json().catch(() => ({}));
    const confirmDeleteOrgs = body.confirm_delete_orgs === true;

    // Fetch all memberships for this user
    const membershipsSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", userId)
      .get();

    // Identify orgs where this user is the sole owner or sole admin
    const soleAdminOrgs: SoleAdminOrg[] = [];

    for (const doc of membershipsSnap.docs) {
      const data = doc.data();
      if (data.role !== "owner" && data.role !== "admin") continue;
      if (data.status !== "active") continue;

      // Check if there's another active owner/admin in this org
      const otherAdminsSnap = await adminDb
        .collection("memberships")
        .where("church_id", "==", data.church_id)
        .where("status", "==", "active")
        .get();

      const otherAdmins = otherAdminsSnap.docs.filter(
        (d) =>
          d.data().user_id !== userId &&
          (d.data().role === "owner" || d.data().role === "admin"),
      );

      if (otherAdmins.length === 0) {
        const churchSnap = await adminDb.doc(`churches/${data.church_id}`).get();
        const churchName = churchSnap.data()?.name || "Unknown Organization";
        soleAdminOrgs.push({ id: data.church_id, name: churchName });
      }
    }

    // If sole-admin orgs exist and caller hasn't confirmed, return warning
    if (soleAdminOrgs.length > 0 && !confirmDeleteOrgs) {
      return NextResponse.json(
        {
          warning: "sole_admin",
          orgs: soleAdminOrgs,
          message:
            "You are the only administrator of one or more organizations. " +
            "Deleting your account will also permanently delete these organizations and all their data.",
        },
        { status: 409 },
      );
    }

    // Gather user info before we delete anything
    const userProfileSnap = await adminDb.doc(`users/${userId}`).get();
    const userEmail = decoded.email;
    const userName =
      userProfileSnap.data()?.display_name || userEmail || "there";

    // 1. Cascade-delete sole-admin orgs
    for (const org of soleAdminOrgs) {
      // Cancel Stripe subscription if active
      const churchSnap = await adminDb.doc(`churches/${org.id}`).get();
      const stripeSubId = churchSnap.data()?.stripe_subscription_id;
      if (stripeSubId) {
        try {
          await stripe.subscriptions.cancel(stripeSubId);
        } catch (err) {
          console.warn(`Failed to cancel Stripe subscription for ${org.id}:`, err);
        }
      }
      await cascadeDeleteOrg(adminDb, org.id);
    }

    // 2. Send departure notifications for non-cascaded orgs (best-effort, before deletion)
    const today = new Date().toISOString().split("T")[0];
    for (const memberDoc of membershipsSnap.docs) {
      const mData = memberDoc.data();
      const wasCascaded = soleAdminOrgs.some((o) => o.id === mData.church_id);
      if (wasCascaded || mData.status !== "active") continue;

      try {
        const churchSnap = await adminDb.doc(`churches/${mData.church_id}`).get();
        const churchName = churchSnap.data()?.name || "your organization";

        // Find future assignments for the departing user's volunteer record
        const vacancies: Array<{ serviceName: string; serviceDate: string; roleName: string }> = [];
        if (mData.volunteer_id) {
          const assignSnap = await adminDb
            .collection(`churches/${mData.church_id}/assignments`)
            .where("volunteer_id", "==", mData.volunteer_id)
            .where("service_date", ">=", today)
            .get();
          for (const a of assignSnap.docs) {
            const ad = a.data();
            vacancies.push({
              serviceName: ad.role_title || "Assignment",
              serviceDate: ad.service_date,
              roleName: ad.role_title || "Volunteer",
            });
          }
        }

        // Find teams affected
        const volunteerSnap = mData.volunteer_id
          ? await adminDb.doc(`churches/${mData.church_id}/people/${mData.volunteer_id}`).get()
          : null;
        const teamsAffected: string[] = [];
        const ministryIds: string[] = volunteerSnap?.data()?.ministry_ids || [];
        if (ministryIds.length > 0) {
          const minSnaps = await Promise.all(
            ministryIds.map((mid) => adminDb.doc(`churches/${mData.church_id}/ministries/${mid}`).get()),
          );
          for (const minSnap of minSnaps) {
            if (minSnap.exists) teamsAffected.push(minSnap.data()?.name || minSnap.id);
          }
        }

        // Notify admins of this org about the departure
        const orgMembersSnap = await adminDb
          .collection("memberships")
          .where("church_id", "==", mData.church_id)
          .where("status", "==", "active")
          .get();

        let schedulersNotified = 0;

        // Batch fetch user profiles for all org members
        const otherMembers = orgMembersSnap.docs.filter((om) => om.data().user_id !== userId);
        const omUserSnaps = await Promise.all(
          otherMembers.map((om) => adminDb.doc(`users/${om.data().user_id}`).get()),
        );
        const omUserMap = new Map(
          omUserSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]),
        );

        for (const om of otherMembers) {
          const omData = om.data();
          const omUser = omUserMap.get(omData.user_id);
          const omEmail = omUser?.email as string | undefined;
          if (!omEmail) continue;
          const omName = (omUser?.display_name as string) || omEmail;

          // Send vacancy alerts to schedulers (if there are future assignments)
          if ((omData.role === "scheduler" || omData.role === "admin" || omData.role === "owner") && vacancies.length > 0) {
            try {
              const { subject, html, text } = buildVacancyAlertEmail({
                schedulerName: omName,
                departedName: userName,
                churchName,
                vacancies,
              });
              await resend.emails.send({
                from: "VolunteerCal <noreply@harpelle.com>",
                to: omEmail,
                subject,
                html,
                text,
              });
              schedulersNotified++;
            } catch {
              // best-effort
            }
          }

          // Send admin departure notification to admins/owners
          if (omData.role === "admin" || omData.role === "owner") {
            try {
              const { subject, html, text } = buildAdminDepartureEmail({
                adminName: omName,
                departedName: userName,
                departedRole: mData.role,
                churchName,
                teamsAffected,
                schedulersNotified,
              });
              await resend.emails.send({
                from: "VolunteerCal <noreply@harpelle.com>",
                to: omEmail,
                subject,
                html,
                text,
              });
            } catch {
              // best-effort
            }
          }
        }
      } catch (notifyErr) {
        console.warn(`Departure notifications failed for org ${mData.church_id}:`, notifyErr);
      }
    }

    // 3. Delete remaining memberships (orgs where user is NOT sole admin)
    const batch = adminDb.batch();
    for (const memberDoc2 of membershipsSnap.docs) {
      const data = memberDoc2.data();
      // Skip memberships already deleted by cascadeDeleteOrg
      const wasCascaded = soleAdminOrgs.some((o) => o.id === data.church_id);
      if (!wasCascaded) {
        batch.delete(memberDoc2.ref);
      }
    }

    // 4. Delete user profile
    const userRef = adminDb.doc(`users/${userId}`);
    batch.delete(userRef);

    await batch.commit();

    // 5. Delete Firebase Auth account
    await adminAuth.deleteUser(userId);

    // 6. Send farewell email (best-effort)
    if (userEmail) {
      try {
        const { subject, html, text } = buildAccountDeletedEmail({ userName });
        await resend.emails.send({
          from: "VolunteerCal <noreply@harpelle.com>",
          to: userEmail,
          subject,
          html,
          text,
        });
      } catch (emailErr) {
        console.warn("Failed to send account deletion email:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Account deleted",
      orgs_deleted: soleAdminOrgs.map((o) => o.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("DELETE /api/account/delete error:", message, err);
    return NextResponse.json(
      { error: `Account deletion failed: ${message}` },
      { status: 500 },
    );
  }
}
