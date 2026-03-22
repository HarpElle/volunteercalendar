import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";

/**
 * POST /api/admin/checkin/household/[householdId]/regenerate-qr
 * Generates a new QR token for a household (invalidates old one).
 */
export async function POST(
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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
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

    const householdRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("checkin_households")
      .doc(householdId);

    const snap = await householdRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    const newToken = randomBytes(16).toString("hex");
    await householdRef.update({
      qr_token: newToken,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ qr_token: newToken });
  } catch (error) {
    console.error("[POST /api/admin/checkin/household/[id]/regenerate-qr]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
