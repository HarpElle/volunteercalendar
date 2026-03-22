import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { randomBytes } from "crypto";
import type { CheckInHousehold, Child } from "@/lib/types";

/**
 * POST /api/checkin/register
 * Unauthenticated kiosk endpoint — first-time visitor registration.
 * Creates a CheckInHousehold and Child documents.
 * Tighter rate limit (10 req/min) to prevent abuse.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const {
      church_id,
      primary_guardian_name,
      primary_guardian_phone,
      secondary_guardian_name,
      secondary_guardian_phone,
      children,
    } = body as {
      church_id: string;
      primary_guardian_name: string;
      primary_guardian_phone: string;
      secondary_guardian_name?: string;
      secondary_guardian_phone?: string;
      children: {
        first_name: string;
        last_name: string;
        date_of_birth?: string;
        grade?: string;
        allergies?: string;
        medical_notes?: string;
      }[];
    };

    if (
      !church_id ||
      !primary_guardian_name ||
      !primary_guardian_phone ||
      !children?.length
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Validate church exists
    const churchRef = adminDb.collection("churches").doc(church_id);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }

    // Normalize phone to E.164
    const normalizedPhone = normalizePhone(primary_guardian_phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const qrToken = randomBytes(16).toString("hex");

    // Create household
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
      qr_token: qrToken,
      imported_from: "manual",
      created_at: now,
      updated_at: now,
    };

    await churchRef
      .collection("checkin_households")
      .doc(householdId)
      .set(household);

    // Create child documents
    const createdChildren: { id: string; first_name: string; last_name: string }[] = [];

    for (const childData of children) {
      if (!childData.first_name || !childData.last_name) continue;

      const childId = adminDb.collection("_").doc().id;
      const hasAlerts = !!(childData.allergies || childData.medical_notes);

      const child: Child = {
        id: childId,
        church_id,
        household_id: householdId,
        first_name: childData.first_name,
        last_name: childData.last_name,
        date_of_birth: childData.date_of_birth || undefined,
        grade: (childData.grade as Child["grade"]) || undefined,
        has_alerts: hasAlerts,
        allergies: childData.allergies || undefined,
        medical_notes: childData.medical_notes || undefined,
        imported_from: "manual",
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      await churchRef.collection("children").doc(childId).set(child);
      createdChildren.push({
        id: childId,
        first_name: childData.first_name,
        last_name: childData.last_name,
      });
    }

    return NextResponse.json({
      household_id: householdId,
      qr_token: qrToken,
      children: createdChildren,
    });
  } catch (error) {
    console.error("[POST /api/checkin/register]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Normalize a phone number to E.164 format.
 * Handles common US formats: (512) 555-1234, 512-555-1234, 5125551234, +15125551234
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
