import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import type { CheckInSettings } from "@/lib/types";

/**
 * GET /api/admin/checkin/settings?church_id=...
 * Retrieve check-in settings for a church.
 *
 * PUT /api/admin/checkin/settings
 * Update check-in settings (service times, thresholds, capacity SMS).
 */

export async function GET(req: NextRequest) {
  try {
    const gate = await requireModuleTier(req, "checkin");
    if (!gate.ok) return gate.response;
    const { churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can manage check-in settings" },
        { status: 403 },
      );
    }

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
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
    });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can manage check-in settings" },
        { status: 403 },
      );
    }

    const body = await req.json();

    const settingsRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkinSettings")
      .doc("config");

    // Build update — only allow specific settings fields
    const allowedFields = [
      "service_times",
      "pre_checkin_window_minutes",
      "late_arrival_threshold_minutes",
      "capacity_sms_recipient_phone",
      "breeze_import_grade_mapping",
      "guardian_sms_on_checkin",
      "guardian_sms_on_checkout",
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
