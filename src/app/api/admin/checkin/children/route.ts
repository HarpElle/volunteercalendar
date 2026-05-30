import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Child } from "@/lib/types";

/**
 * GET /api/admin/checkin/children?church_id=...&household_id=...
 * List children, optionally filtered by household.
 *
 * POST /api/admin/checkin/children
 * Create a new child record.
 */

async function verifyAdmin(
  req: NextRequest,
  churchId: string,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  const userId = decoded.uid;

  const membershipSnap = await adminDb
    .doc(`memberships/${userId}_${churchId}`)
    .get();
  if (!membershipSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const membership = membershipSnap.data()!;
  const role = membership.role as string;
  const isCheckinVolunteer = membership.checkin_volunteer === true;
  if (!["owner", "admin", "scheduler"].includes(role) && !isCheckinVolunteer) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }
  return { userId };
}

export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    const householdId = req.nextUrl.searchParams.get("household_id");

    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Detect whether unified `people` collection is populated
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnified = !peopleSample.empty;

    if (useUnified) {
      // Read children from unified `people` collection
      let childQuery: FirebaseFirestore.Query = churchRef
        .collection("people")
        .where("person_type", "==", "child")
        .where("status", "==", "active");

      // Filter by household_id via array-contains
      if (householdId) {
        childQuery = childQuery.where("household_ids", "array-contains", householdId);
      }

      const snap = await childQuery.get();

      // Map Person docs to legacy Child shape for admin UI compatibility
      const children = snap.docs.map((doc) => {
        const d = doc.data();
        const cp = d.child_profile || {};
        return {
          id: doc.id,
          church_id: d.church_id,
          household_id: Array.isArray(d.household_ids) ? d.household_ids[0] || null : null,
          first_name: d.first_name,
          last_name: d.last_name,
          preferred_name: d.preferred_name || null,
          date_of_birth: cp.date_of_birth || null,
          grade: cp.grade || null,
          photo_url: d.photo_url || cp.photo_url || null,
          default_room_id: cp.default_room_id || null,
          has_alerts: cp.has_alerts || false,
          allergies: cp.allergies || null,
          medical_notes: cp.medical_notes || null,
          is_active: d.status === "active",
          created_at: d.created_at,
          updated_at: d.updated_at,
        };
      });

      return NextResponse.json({ children });
    }

    // Legacy: read from children collection
    let query: FirebaseFirestore.Query = churchRef.collection("children").where("is_active", "==", true);

    if (householdId) {
      query = query.where("household_id", "==", householdId);
    }

    const snap = await query.get();
    const children = snap.docs.map((doc) => doc.data());

    return NextResponse.json({ children });
  } catch (error) {
    console.error("[GET /api/admin/checkin/children]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { church_id, household_id } = body;

    if (!church_id || !household_id) {
      return NextResponse.json(
        { error: "Missing church_id or household_id" },
        { status: 400 },
      );
    }

    const auth = await verifyAdmin(req, church_id);
    if (auth instanceof NextResponse) return auth;

    const { first_name, last_name } = body;
    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Detect whether unified `people` collection is populated
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnified = !peopleSample.empty;

    if (useUnified) {
      // Verify household exists in unified households collection
      const householdSnap = await churchRef
        .collection("households")
        .doc(household_id)
        .get();
      if (!householdSnap.exists) {
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
      }

      const now = new Date().toISOString();
      const hasAlerts = !!(body.allergies || body.medical_notes);

      const personData: Record<string, unknown> = {
        church_id,
        person_type: "child",
        first_name,
        last_name,
        preferred_name: body.preferred_name || null,
        name: `${first_name} ${last_name}`,
        search_name: `${first_name} ${last_name}`.toLowerCase(),
        email: null,
        phone: null,
        search_phones: [],
        photo_url: body.photo_url || null,
        user_id: null,
        membership_id: null,
        status: "active",
        is_volunteer: false,
        ministry_ids: [],
        role_ids: [],
        campus_ids: [],
        household_ids: [household_id],
        scheduling_profile: null,
        child_profile: {
          date_of_birth: body.date_of_birth || null,
          grade: body.grade || null,
          photo_url: body.photo_url || null,
          default_room_id: body.default_room_id || null,
          has_alerts: hasAlerts,
          allergies: body.allergies || null,
          medical_notes: body.medical_notes || null,
          authorized_pickups: [],
        },
        stats: null,
        imported_from: "manual",
        background_check: null,
        role_constraints: null,
        volunteer_journey: null,
        qr_token: null,
        created_at: now,
        updated_at: now,
      };

      const newRef = await churchRef.collection("people").add(personData);

      // Return in legacy-compatible shape for admin UI
      const result: Record<string, unknown> = {
        id: newRef.id,
        church_id,
        household_id,
        first_name,
        last_name,
        has_alerts: hasAlerts,
        imported_from: "manual",
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      if (body.preferred_name) result.preferred_name = body.preferred_name;
      if (body.date_of_birth) result.date_of_birth = body.date_of_birth;
      if (body.grade) result.grade = body.grade;
      if (body.photo_url) result.photo_url = body.photo_url;
      if (body.default_room_id) result.default_room_id = body.default_room_id;
      if (body.allergies) result.allergies = body.allergies;
      if (body.medical_notes) result.medical_notes = body.medical_notes;

      return NextResponse.json(result, { status: 201 });
    }

    // Legacy: verify household in checkin_households, write to children
    const householdSnap = await churchRef
      .collection("checkin_households")
      .doc(household_id)
      .get();
    if (!householdSnap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const childId = adminDb.collection("_").doc().id;
    const hasAlerts = !!(body.allergies || body.medical_notes);

    const child: Record<string, unknown> = {
      id: childId,
      church_id,
      household_id,
      first_name,
      last_name,
      has_alerts: hasAlerts,
      imported_from: "manual",
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    // Only include optional fields if they have values (Firestore rejects undefined)
    if (body.preferred_name) child.preferred_name = body.preferred_name;
    if (body.date_of_birth) child.date_of_birth = body.date_of_birth;
    if (body.grade) child.grade = body.grade;
    if (body.photo_url) child.photo_url = body.photo_url;
    if (body.default_room_id) child.default_room_id = body.default_room_id;
    if (body.allergies) child.allergies = body.allergies;
    if (body.medical_notes) child.medical_notes = body.medical_notes;

    await churchRef.collection("children").doc(childId).set(child);

    return NextResponse.json(child, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/checkin/children]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
