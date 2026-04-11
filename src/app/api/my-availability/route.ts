import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/my-availability?church_id=...
 *
 * Returns the current user's volunteer record with availability data.
 * Looks up the volunteer doc where user_id matches the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership
    const membershipId = `${uid}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Find volunteer doc for this user
    const volSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .where("user_id", "==", uid)
      .limit(1)
      .get();

    if (volSnap.empty) {
      return NextResponse.json({ volunteer: null });
    }

    const doc = volSnap.docs[0];
    const data = doc.data();
    const sp = (data.scheduling_profile || {}) as Record<string, unknown>;
    return NextResponse.json({
      volunteer: {
        id: doc.id,
        ...data,
        // Expose scheduling_profile fields under the legacy `availability` key
        // so the client-side availability page continues to work without changes.
        availability: {
          blockout_dates: sp.blockout_dates ?? [],
          recurring_unavailable: sp.recurring_unavailable ?? [],
          preferred_frequency: sp.preferred_frequency ?? 4,
          max_roles_per_month: sp.max_roles_per_month ?? 4,
          preferred_weeks: sp.preferred_weeks ?? [],
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/my-availability]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/my-availability
 *
 * Update the current user's availability fields on their volunteer record.
 * Only allows updating availability-related fields (blockout_dates,
 * recurring_unavailable, preferred_frequency, max_roles_per_month).
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json();
    const { church_id, availability } = body as {
      church_id: string;
      availability: {
        blockout_dates?: string[];
        recurring_unavailable?: string[];
        preferred_frequency?: number;
        max_roles_per_month?: number;
        preferred_weeks?: number[];
      };
    };

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }
    if (!availability) {
      return NextResponse.json(
        { error: "Missing availability" },
        { status: 400 },
      );
    }

    // Verify membership
    const membershipId = `${uid}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Find volunteer doc for this user
    const volSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("people")
      .where("user_id", "==", uid)
      .limit(1)
      .get();

    if (volSnap.empty) {
      return NextResponse.json(
        { error: "No volunteer record found" },
        { status: 404 },
      );
    }

    const volRef = volSnap.docs[0].ref;

    // Build the update — only allow availability sub-fields
    const update: Record<string, unknown> = {};
    if (Array.isArray(availability.blockout_dates)) {
      update["scheduling_profile.blockout_dates"] = availability.blockout_dates;
    }
    if (Array.isArray(availability.recurring_unavailable)) {
      update["scheduling_profile.recurring_unavailable"] =
        availability.recurring_unavailable;
    }
    if (typeof availability.preferred_frequency === "number") {
      update["scheduling_profile.preferred_frequency"] =
        availability.preferred_frequency;
    }
    if (typeof availability.max_roles_per_month === "number") {
      update["scheduling_profile.max_roles_per_month"] =
        availability.max_roles_per_month;
    }
    if (Array.isArray(availability.preferred_weeks)) {
      update["scheduling_profile.preferred_weeks"] =
        availability.preferred_weeks;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    await volRef.update(update);

    // Also sync blockout dates and recurring unavailable to the global user profile
    const globalUpdate: Record<string, unknown> = {};
    if (Array.isArray(availability.blockout_dates)) {
      globalUpdate["global_availability.blockout_dates"] =
        availability.blockout_dates;
    }
    if (Array.isArray(availability.recurring_unavailable)) {
      globalUpdate["global_availability.recurring_unavailable"] =
        availability.recurring_unavailable;
    }
    if (Object.keys(globalUpdate).length > 0) {
      await adminDb.doc(`users/${uid}`).update(globalUpdate);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/my-availability]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
