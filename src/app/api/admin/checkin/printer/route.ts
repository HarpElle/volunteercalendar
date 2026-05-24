import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import type { PrinterConfig } from "@/lib/types";

/**
 * POST /api/admin/checkin/printer
 * Upsert a printer configuration in checkinSettings.
 * If printer with same id exists, updates it; otherwise adds it.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
    });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can configure printers" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { printer } = body as {
      church_id: string;
      printer: PrinterConfig;
    };

    if (!printer?.id || !printer.printer_type || !printer.station_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const settingsRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkinSettings")
      .doc("config");

    const settingsSnap = await settingsRef.get();

    if (!settingsSnap.exists) {
      // Create settings with this printer
      await settingsRef.set({
        service_times: [],
        pre_checkin_window_minutes: 30,
        late_arrival_threshold_minutes: 15,
        printers: [printer],
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });
    } else {
      const data = settingsSnap.data()!;
      const printers = (data.printers || []) as PrinterConfig[];

      // Find existing printer by id
      const idx = printers.findIndex((p) => p.id === printer.id);
      if (idx >= 0) {
        printers[idx] = printer;
      } else {
        printers.push(printer);
      }

      await settingsRef.update({
        printers,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, printer });
  } catch (error) {
    console.error("[POST /api/admin/checkin/printer]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
