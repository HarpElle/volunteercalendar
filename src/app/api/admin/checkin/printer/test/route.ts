import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getPrinterAdapter } from "@/lib/services/printing";
import type { LabelJob, PrinterConfig } from "@/lib/types";

/**
 * POST /api/admin/checkin/printer/test
 * Generate a test label payload for a printer config.
 * Returns label data that the client can send to the companion print service.
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
    const { church_id, printer_id } = body as {
      church_id: string;
      printer_id: string;
    };

    if (!church_id || !printer_id) {
      return NextResponse.json(
        { error: "Missing church_id or printer_id" },
        { status: 400 },
      );
    }

    // Verify membership
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can test printers" },
        { status: 403 },
      );
    }

    // Load printer config
    const settingsSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("checkinSettings")
      .doc("config")
      .get();

    if (!settingsSnap.exists) {
      return NextResponse.json(
        { error: "No check-in settings configured" },
        { status: 404 },
      );
    }

    const printers = (settingsSnap.data()!.printers || []) as PrinterConfig[];
    const printerConfig = printers.find((p) => p.id === printer_id);

    if (!printerConfig) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 },
      );
    }

    // Load church name
    const churchSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .get();
    const churchName = churchSnap.exists
      ? (churchSnap.data()!.name as string)
      : "Test Church";

    // Generate test child label
    const testJob: LabelJob = {
      type: "child_label",
      child_name: "Test Child",
      room_name: "Room 101",
      service_date: formatDateForLabel(new Date().toISOString().split("T")[0]),
      security_code: "T3ST",
      church_name: churchName,
      has_allergy_alert: true,
      allergy_text: "Peanuts (TEST)",
    };

    const adapter = getPrinterAdapter(printerConfig.printer_type);
    const payload = await adapter.generateLabel(testJob, printerConfig);

    return NextResponse.json({
      label_payload: payload,
      print_server_url: printerConfig.print_server_url || null,
    });
  } catch (error) {
    console.error("[POST /api/admin/checkin/printer/test]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function formatDateForLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
