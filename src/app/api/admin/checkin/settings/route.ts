import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
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
      // Wave 9 P0-2: Emergency Response Team for blocked-pickup attempts.
      // Owner retains override authority; ERT recipients are SMS-paged in
      // parallel as a tripwire. Audit separately below.
      "emergency_notification_numbers",
      // Wave 9 P0-4: HIPAA-aware per-field visibility for the medical
      // surface. Server validates shape below — only persists if it
      // matches the expected { allergies, medical_notes, medications }
      // × { label, roster, expand_on_tap_only } structure.
      "medical_visibility",
      // Wave 9 P0-5 sub-PR D: ratio warning threshold percent (0–100).
      // Clamped in code; the kiosk gate also falls through to the
      // DEFAULT_RATIO_WARNING_PERCENT (90) when absent.
      "ratio_warning_threshold_percent",
      // Wave 10 W10-R: how the child's name renders on the printed
      // sticker. One of "first_name_last_initial" (default),
      // "first_name", "first_and_last". Validated below.
      "label_content_format",
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

    // Validate ERT array shape if supplied — drop anything malformed so
    // we never persist a phone number we can't actually dial.
    if ("emergency_notification_numbers" in updates) {
      const raw = updates.emergency_notification_numbers;
      if (raw !== undefined && raw !== null && !Array.isArray(raw)) {
        return NextResponse.json(
          { error: "emergency_notification_numbers must be an array" },
          { status: 400 },
        );
      }
      const cleaned = Array.isArray(raw)
        ? raw
            .map((entry: unknown) => {
              if (
                !entry ||
                typeof entry !== "object" ||
                Array.isArray(entry)
              ) {
                return null;
              }
              const obj = entry as Record<string, unknown>;
              const name = typeof obj.name === "string" ? obj.name.trim() : "";
              const phone =
                typeof obj.phone === "string" ? obj.phone.trim() : "";
              if (!name || !phone) return null;
              const role =
                typeof obj.role === "string" && obj.role.trim().length > 0
                  ? obj.role.trim()
                  : null;
              return { name, phone, role };
            })
            .filter((e): e is { name: string; phone: string; role: string | null } => e !== null)
        : [];
      updates.emergency_notification_numbers = cleaned;
    }

    // Wave 10 W10-R: label_content_format whitelist. Reject unknown
    // values so a typo can't silently revert behavior to a default
    // the admin didn't intend.
    if ("label_content_format" in updates) {
      const v = updates.label_content_format;
      if (v === null || v === undefined) {
        // Explicit clear → revert to default rendering.
        updates.label_content_format = null;
      } else if (
        v !== "first_name_last_initial" &&
        v !== "first_name" &&
        v !== "first_and_last"
      ) {
        return NextResponse.json(
          {
            error:
              "label_content_format must be 'first_name_last_initial', 'first_name', or 'first_and_last'",
          },
          { status: 400 },
        );
      }
    }

    // Wave 9 P0-4: medical_visibility shape validation. Reject any
    // body whose `medical_visibility` doesn't match the expected
    // structure rather than silently coercing — admins seeing a
    // 400 immediately know their settings UI sent malformed data,
    // versus a coerced write that "succeeded" but lost their intent.
    if ("medical_visibility" in updates) {
      const raw = updates.medical_visibility;
      if (raw === null || raw === undefined) {
        // Explicit clear → revert to default behavior.
        updates.medical_visibility = null;
      } else {
        const fieldsOk = (
          ["allergies", "medical_notes", "medications"] as const
        ).every((f) => {
          const c = (raw as Record<string, unknown>)?.[f];
          if (!c || typeof c !== "object") return false;
          const cf = c as Record<string, unknown>;
          return (
            typeof cf.label === "boolean" &&
            typeof cf.roster === "boolean" &&
            typeof cf.expand_on_tap_only === "boolean"
          );
        });
        if (!fieldsOk) {
          return NextResponse.json(
            {
              error:
                "medical_visibility must include allergies, medical_notes, medications, each with boolean label/roster/expand_on_tap_only",
            },
            { status: 400 },
          );
        }
      }
    }

    const snap = await settingsRef.get();
    const before = snap.data() as CheckInSettings | undefined;
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

    // Audit ERT mutations separately from the catch-all settings save —
    // ERT membership is a legally material signal worth its own row.
    if ("emergency_notification_numbers" in updates) {
      const after = (updates.emergency_notification_numbers ??
        []) as CheckInSettings["emergency_notification_numbers"];
      const beforeList = before?.emergency_notification_numbers ?? [];
      const afterList = after ?? [];
      // Only emit if the set actually changed (compare normalized JSON).
      const beforeKey = JSON.stringify(
        beforeList.map((e) => `${e.phone}|${e.name}|${e.role ?? ""}`).sort(),
      );
      const afterKey = JSON.stringify(
        afterList.map((e) => `${e.phone}|${e.name}|${e.role ?? ""}`).sort(),
      );
      if (beforeKey !== afterKey) {
        void audit({
          church_id: churchId,
          actor: userActor(userId),
          action: "checkin.ert_settings_updated",
          target_type: "checkinSettings",
          target_id: "config",
          metadata: {
            before_count: beforeList.length,
            after_count: afterList.length,
          },
          outcome: "ok",
        });
      }
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
