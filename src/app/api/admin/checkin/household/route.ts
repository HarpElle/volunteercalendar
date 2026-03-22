import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import type { CheckInHousehold } from "@/lib/types";

/**
 * POST /api/admin/checkin/household
 * Create a new check-in household. Requires owner/admin/scheduler role.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership
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

    const {
      primary_guardian_name,
      primary_guardian_phone,
      secondary_guardian_name,
      secondary_guardian_phone,
    } = body;

    if (!primary_guardian_name || !primary_guardian_phone) {
      return NextResponse.json(
        { error: "Missing required fields: primary_guardian_name, primary_guardian_phone" },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(primary_guardian_phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const householdId = adminDb.collection("_").doc().id;

    const household: CheckInHousehold = {
      id: householdId,
      church_id,
      primary_guardian_name,
      primary_guardian_phone: normalizedPhone,
      secondary_guardian_name: secondary_guardian_name || undefined,
      secondary_guardian_phone: secondary_guardian_phone
        ? normalizePhone(secondary_guardian_phone) || undefined
        : undefined,
      qr_token: randomBytes(16).toString("hex"),
      imported_from: "manual",
      created_at: now,
      updated_at: now,
      created_by: userId,
    };

    await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("checkin_households")
      .doc(householdId)
      .set(household);

    return NextResponse.json(household, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/checkin/household]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
