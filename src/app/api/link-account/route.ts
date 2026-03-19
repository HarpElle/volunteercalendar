import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/link-account
 *
 * Links a newly registered user to their prior guest activity:
 * 1. Updates orphaned event_signups (user_id: null) matching their email
 * 2. Creates volunteer records + memberships for each church they signed up with
 * 3. Consumes any pending_invites for their email
 *
 * Auth: Bearer token required. Email read from verified token.
 * Idempotent: safe to call multiple times.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;
    const email = decoded.email;

    if (!email) {
      return NextResponse.json({ error: "No email on token" }, { status: 400 });
    }

    let linkedSignups = 0;
    let membershipsCreated = 0;
    const now = new Date().toISOString();

    // --- 1. Link orphaned event_signups ---
    const orphanedSnap = await adminDb
      .collection("event_signups")
      .where("volunteer_email", "==", email)
      .where("user_id", "==", null)
      .get();

    const churchIds = new Set<string>();
    const volunteerName =
      orphanedSnap.docs[0]?.data().volunteer_name || decoded.name || email;

    for (const doc of orphanedSnap.docs) {
      await doc.ref.update({ user_id: uid });
      churchIds.add(doc.data().church_id);
      linkedSignups++;
    }

    // --- 2. Check pending_invites ---
    const pendingSnap = await adminDb
      .collection("pending_invites")
      .where("email", "==", email)
      .get();

    // Map of churchId → invited role from pending_invites
    const invitedRoles = new Map<string, string>();
    for (const doc of pendingSnap.docs) {
      const data = doc.data();
      if (data.church_id) {
        churchIds.add(data.church_id);
        invitedRoles.set(data.church_id, data.role || "volunteer");
      }
    }

    // --- 3. Create volunteer + membership for each church ---
    let firstChurchId: string | null = null;

    for (const churchId of churchIds) {
      // Check if membership already exists
      const membershipId = `${uid}_${churchId}`;
      const existingMem = await adminDb.doc(`memberships/${membershipId}`).get();
      if (existingMem.exists) continue;

      // Check if church exists
      const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
      if (!churchSnap.exists) continue;

      // Check if volunteer with this email already exists in the church
      const existingVolSnap = await adminDb
        .collection(`churches/${churchId}/volunteers`)
        .where("email", "==", email)
        .limit(1)
        .get();

      let volunteerId: string;
      if (existingVolSnap.empty) {
        // Create volunteer record
        const volRef = adminDb.collection(`churches/${churchId}/volunteers`).doc();
        await volRef.set({
          church_id: churchId,
          name: volunteerName,
          email,
          phone: null,
          user_id: uid,
          membership_id: membershipId,
          status: "active",
          ministry_ids: [],
          role_ids: [],
          household_id: null,
          availability: {
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
        });
        volunteerId = volRef.id;
      } else {
        volunteerId = existingVolSnap.docs[0].id;
        // Link the existing volunteer to this user
        await existingVolSnap.docs[0].ref.update({
          user_id: uid,
          membership_id: membershipId,
        });
      }

      // Also update event_signups that belong to this church with the volunteer_id
      const churchSignups = orphanedSnap.docs.filter(
        (d) => d.data().church_id === churchId,
      );
      for (const s of churchSignups) {
        await s.ref.update({ volunteer_id: volunteerId });
      }

      // Create membership
      const role = invitedRoles.get(churchId) || "volunteer";
      await adminDb.doc(`memberships/${membershipId}`).set({
        user_id: uid,
        church_id: churchId,
        role,
        ministry_scope: [],
        status: "active",
        invited_by: null,
        volunteer_id: volunteerId,
        reminder_preferences: { channels: ["email"] },
        created_at: now,
        updated_at: now,
      });

      membershipsCreated++;
      if (!firstChurchId) firstChurchId = churchId;
    }

    // --- 4. Update user profile default_church_id if needed ---
    if (firstChurchId) {
      const profileSnap = await adminDb.doc(`users/${uid}`).get();
      if (profileSnap.exists) {
        const profile = profileSnap.data()!;
        if (!profile.default_church_id) {
          await profileSnap.ref.update({ default_church_id: firstChurchId });
        }
      }
    }

    // --- 5. Clean up consumed pending_invites ---
    for (const doc of pendingSnap.docs) {
      await doc.ref.delete();
    }

    return NextResponse.json({
      linked_signups: linkedSignups,
      memberships_created: membershipsCreated,
    });
  } catch (err) {
    console.error("POST /api/link-account error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
