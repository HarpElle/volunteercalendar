import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/admin/checkin/household/[householdId]
 * Retrieve a single check-in household with its children.
 *
 * PUT /api/admin/checkin/household/[householdId]
 * Update household guardian info.
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const { householdId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(churchId);

    const householdSnap = await churchRef
      .collection("checkin_households")
      .doc(householdId)
      .get();
    if (!householdSnap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    // Load children
    const childrenSnap = await churchRef
      .collection("children")
      .where("household_id", "==", householdId)
      .get();

    const children = childrenSnap.docs.map((doc) => doc.data());

    return NextResponse.json({
      household: householdSnap.data(),
      children,
    });
  } catch (error) {
    console.error("[GET /api/admin/checkin/household/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const { householdId } = await params;
    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, church_id);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(church_id);
    const householdRef = churchRef
      .collection("checkin_households")
      .doc(householdId);

    const householdSnap = await householdRef.get();
    if (!householdSnap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    // Build update fields (only allow specific fields)
    const allowedFields = [
      "primary_guardian_name",
      "primary_guardian_phone",
      "secondary_guardian_name",
      "secondary_guardian_phone",
      "photo_url",
    ];

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in body) {
        if (field.includes("phone") && body[field]) {
          const normalized = normalizePhone(body[field]);
          if (!normalized) {
            return NextResponse.json(
              { error: `Invalid phone format for ${field}` },
              { status: 400 },
            );
          }
          updates[field] = normalized;
        } else {
          updates[field] = body[field];
        }
      }
    }

    await householdRef.update(updates);

    const updated = await householdRef.get();
    return NextResponse.json(updated.data());
  } catch (error) {
    console.error("[PUT /api/admin/checkin/household/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const { householdId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(churchId);
    const householdRef = churchRef
      .collection("checkin_households")
      .doc(householdId);

    const householdSnap = await householdRef.get();
    if (!householdSnap.exists) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }

    // Delete all children in this household
    const childrenSnap = await churchRef
      .collection("children")
      .where("household_id", "==", householdId)
      .get();

    const batch = adminDb.batch();
    for (const doc of childrenSnap.docs) {
      batch.delete(doc.ref);
    }
    batch.delete(householdRef);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/checkin/household/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
