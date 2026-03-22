import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/admin/checkin/children/[childId]?church_id=...
 * Retrieve a single child record.
 *
 * PUT /api/admin/checkin/children/[childId]
 * Update a child record.
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const childSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("children")
      .doc(childId)
      .get();

    if (!childSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    return NextResponse.json(childSnap.data());
  } catch (error) {
    console.error("[GET /api/admin/checkin/children/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await params;
    const body = await req.json();
    const { church_id } = body;

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, church_id);
    if (auth instanceof NextResponse) return auth;

    const childRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("children")
      .doc(childId);

    const childSnap = await childRef.get();
    if (!childSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    const allowedFields = [
      "first_name",
      "last_name",
      "preferred_name",
      "date_of_birth",
      "grade",
      "photo_url",
      "default_room_id",
      "allergies",
      "medical_notes",
      "is_active",
    ];

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Recompute has_alerts
    const allergies =
      "allergies" in body ? body.allergies : childSnap.data()!.allergies;
    const medicalNotes =
      "medical_notes" in body
        ? body.medical_notes
        : childSnap.data()!.medical_notes;
    updates.has_alerts = !!(allergies || medicalNotes);

    await childRef.update(updates);

    const updated = await childRef.get();
    return NextResponse.json(updated.data());
  } catch (error) {
    console.error("[PUT /api/admin/checkin/children/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
