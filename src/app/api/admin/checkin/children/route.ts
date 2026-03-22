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
  const role = membershipSnap.data()!.role as string;
  if (!["owner", "admin", "scheduler"].includes(role)) {
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
    let query = churchRef.collection("children").where("is_active", "==", true);

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

    // Verify household exists
    const churchRef = adminDb.collection("churches").doc(church_id);
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

    const child: Child = {
      id: childId,
      church_id,
      household_id,
      first_name,
      last_name,
      preferred_name: body.preferred_name || undefined,
      date_of_birth: body.date_of_birth || undefined,
      grade: body.grade || undefined,
      photo_url: body.photo_url || undefined,
      default_room_id: body.default_room_id || undefined,
      has_alerts: hasAlerts,
      allergies: body.allergies || undefined,
      medical_notes: body.medical_notes || undefined,
      imported_from: "manual",
      is_active: true,
      created_at: now,
      updated_at: now,
    };

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
