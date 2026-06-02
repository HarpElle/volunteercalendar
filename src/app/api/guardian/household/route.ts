import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import type { CheckInHousehold, Child } from "@/lib/types";

/**
 * GET /api/guardian/household?token=...&church_id=...
 * Public token-based endpoint — returns household info, children, and recent check-in history.
 *
 * PUT /api/guardian/household
 * Public token-based endpoint — updates guardian names and phone numbers.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = req.nextUrl.searchParams.get("token");
    const churchId = req.nextUrl.searchParams.get("church_id");

    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Load church name
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }
    const churchData = churchSnap.data()!;
    const churchName = churchData.name as string;
    // W11 Sub-PR D: church logo surfaces in the /guardian portal
    // header. Null when no custom logo uploaded.
    const churchLogoUrl =
      (churchData.logo_url as string | null | undefined) ?? null;

    // Find household by QR token
    const householdsSnap = await churchRef
      .collection("checkin_households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();

    if (householdsSnap.empty) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 },
      );
    }

    const householdDoc = householdsSnap.docs[0];
    const household = {
      id: householdDoc.id,
      ...householdDoc.data(),
    } as CheckInHousehold;

    // Load children
    const childrenSnap = await churchRef
      .collection("children")
      .where("household_id", "==", household.id)
      .where("is_active", "==", true)
      .get();

    const children = childrenSnap.docs.map((d) => {
      const data = d.data() as Child;
      return {
        id: d.id,
        first_name: data.first_name,
        last_name: data.last_name,
        preferred_name: data.preferred_name,
        grade: data.grade,
      };
    });

    // Load recent check-in sessions (last 30 days). The previous
    // query had `.where("household_id","==",X).where("service_date",
    // ">=",cutoff).orderBy("service_date","desc")` which requires a
    // composite index on (household_id, service_date) that hasn't
    // been deployed — Firestore threw FAILED_PRECONDITION and the
    // endpoint 500'd, blocking the portal page from rendering at all.
    //
    // Fix: query by household_id only (single-field index already
    // exists), then filter the date cutoff + sort + limit in memory.
    // The total session count per household is small (rarely >100),
    // so the in-process work is cheap.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("household_id", "==", household.id)
      .get();

    const sessions = sessionsSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          child_id: data.child_id as string,
          service_date: data.service_date as string,
          room_name: data.room_name as string,
          checked_in_at: data.checked_in_at as string,
          checked_out_at: (data.checked_out_at as string | null) || null,
        };
      })
      .filter((s) => s.service_date >= cutoffDate)
      .sort((a, b) => b.service_date.localeCompare(a.service_date))
      .slice(0, 50);

    return NextResponse.json({
      church_name: churchName,
      church_logo_url: churchLogoUrl,
      household: {
        id: household.id,
        primary_guardian_name: household.primary_guardian_name,
        primary_guardian_phone: household.primary_guardian_phone
          ? `***${household.primary_guardian_phone.slice(-4)}`
          : null,
        secondary_guardian_name: household.secondary_guardian_name || null,
        secondary_guardian_phone: household.secondary_guardian_phone
          ? `***${household.secondary_guardian_phone.slice(-4)}`
          : null,
      },
      children,
      sessions,
    });
  } catch (error) {
    console.error("[GET /api/guardian/household]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { token, church_id, primary_guardian_name, primary_guardian_phone,
            secondary_guardian_name, secondary_guardian_phone } = body as {
      token: string;
      church_id: string;
      primary_guardian_name?: string;
      primary_guardian_phone?: string;
      secondary_guardian_name?: string;
      secondary_guardian_phone?: string;
    };

    if (!token || !church_id) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Find household by QR token
    const householdsSnap = await churchRef
      .collection("checkin_households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();

    if (householdsSnap.empty) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 },
      );
    }

    const householdDoc = householdsSnap.docs[0];

    // Only allow updating guardian names and phones
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (primary_guardian_name !== undefined) {
      updates.primary_guardian_name = primary_guardian_name.trim();
    }
    if (primary_guardian_phone !== undefined) {
      updates.primary_guardian_phone = normalizePhone(primary_guardian_phone);
    }
    if (secondary_guardian_name !== undefined) {
      updates.secondary_guardian_name = secondary_guardian_name.trim() || null;
    }
    if (secondary_guardian_phone !== undefined) {
      updates.secondary_guardian_phone = secondary_guardian_phone
        ? normalizePhone(secondary_guardian_phone)
        : null;
    }

    await churchRef
      .collection("checkin_households")
      .doc(householdDoc.id)
      .update(updates);

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("[PUT /api/guardian/household]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
