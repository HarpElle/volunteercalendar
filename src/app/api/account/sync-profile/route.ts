import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { parseName } from "@/lib/utils/name";

/**
 * POST /api/account/sync-profile
 *
 * Syncs user profile data (name, email, phone, availability) to all linked
 * volunteer records across every org the user belongs to.
 *
 * Called after profile updates (account settings) and availability changes
 * (my-schedule page). Uses admin SDK because volunteer records are in church
 * subcollections where writes require schedulerOrAbove.
 *
 * Auth: Bearer token required.
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

    // Read user profile
    const profileSnap = await adminDb.doc(`users/${uid}`).get();
    if (!profileSnap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profile = profileSnap.data()!;

    // Find all active memberships with linked volunteer records
    const memSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("status", "==", "active")
      .get();

    let synced = 0;

    for (const memDoc of memSnap.docs) {
      const mem = memDoc.data();
      if (!mem.volunteer_id || !mem.church_id) continue;

      const volRef = adminDb.doc(
        `churches/${mem.church_id}/people/${mem.volunteer_id}`,
      );
      const volSnap = await volRef.get();
      if (!volSnap.exists) continue;

      const existing = volSnap.data()!;
      const sp = (existing.scheduling_profile as Record<string, unknown>) || {};

      // Merge profile data into person doc, preserving scheduling-specific fields
      const fullName = profile.display_name || existing.name;
      const { first_name, last_name } = parseName(fullName);
      await volRef.update({
        name: fullName,
        first_name,
        last_name,
        email: profile.email || existing.email,
        phone: profile.phone ?? existing.phone,
        ...(profile.photo_url !== undefined ? { photo_url: profile.photo_url } : {}),
        "scheduling_profile.blockout_dates": profile.global_availability?.blockout_dates ?? sp.blockout_dates ?? [],
        "scheduling_profile.recurring_unavailable": profile.global_availability?.recurring_unavailable ?? sp.recurring_unavailable ?? [],
        // Preserve volunteer-specific scheduling preferences
        "scheduling_profile.preferred_frequency": sp.preferred_frequency ?? 2,
        "scheduling_profile.max_roles_per_month": sp.max_roles_per_month ?? 8,
      });

      synced++;
    }

    return NextResponse.json({ synced });
  } catch (err) {
    console.error("POST /api/account/sync-profile error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
