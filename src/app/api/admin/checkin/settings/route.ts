import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { CheckInSettings } from "@/lib/types";

/**
 * GET /api/admin/checkin/settings?church_id=...
 * Retrieve check-in settings for a church.
 *
 * PUT /api/admin/checkin/settings
 * Update check-in settings (service times, thresholds, capacity SMS).
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
  if (!["owner", "admin"].includes(role)) {
    return NextResponse.json(
      { error: "Only admins can manage check-in settings" },
      { status: 403 },
    );
  }
  return { userId };
}

export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const settingsSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkinSettings")
      .doc("config")
      .get();

    if (!settingsSnap.exists) {
      // Return defaults
      const defaults: Omit<CheckInSettings, "updated_by" | "updated_at"> = {
        service_times: [],
        pre_checkin_window_minutes: 30,
        late_arrival_threshold_minutes: 15,
        printers: [],
      };
      return NextResponse.json(defaults);
    }

    return NextResponse.json(settingsSnap.data());
  } catch (error) {
    console.error("[GET /api/admin/checkin/settings]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, church_id);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const settingsRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("checkinSettings")
      .doc("config");

    // Build update — only allow specific settings fields
    const allowedFields = [
      "service_times",
      "pre_checkin_window_minutes",
      "late_arrival_threshold_minutes",
      "capacity_sms_recipient_phone",
      "breeze_import_grade_mapping",
    ];

    const updates: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    const snap = await settingsRef.get();
    if (snap.exists) {
      await settingsRef.update(updates);
    } else {
      // Create with defaults + provided fields
      await settingsRef.set({
        service_times: [],
        pre_checkin_window_minutes: 30,
        late_arrival_threshold_minutes: 15,
        printers: [],
        ...updates,
      });
    }

    const updated = await settingsRef.get();
    return NextResponse.json(updated.data());
  } catch (error) {
    console.error("[PUT /api/admin/checkin/settings]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
