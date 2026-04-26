import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import type { PrinterConfig, PrinterType, PrintMethod, PrinterConnectionType, BrotherLabelSize, ZebraLabelSize, DymoLabelSize } from "@/lib/types";

type LabelSize = BrotherLabelSize | ZebraLabelSize | DymoLabelSize;

const VALID_PRINTER_TYPES: PrinterType[] = ["brother_ql", "zebra_zd", "dymo_labelwriter"];
const VALID_PRINT_METHODS: PrintMethod[] = ["native_sdk", "print_server", "airprint"];
const VALID_CONNECTION_TYPES: PrinterConnectionType[] = ["bluetooth", "wifi"];

/**
 * POST /api/checkin/printer-config
 * Saves printer configuration for a church's kiosk.
 * Called from the kiosk printer setup wizard.
 * Requires X-Kiosk-Token header (see src/lib/server/authz.ts).
 */
export async function POST(req: NextRequest) {
  const kiosk = requireKioskToken(req, "print");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { church_id, printer } = body as {
      church_id: string;
      printer: {
        station_name?: string;
        printer_type: string;
        ip_address?: string;
        label_size?: string;
        print_server_url?: string;
        print_method?: string;
        connection_type?: string;
        bluetooth_address?: string;
        printer_model?: string;
      };
    };

    if (!church_id || !printer?.printer_type) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, printer.printer_type" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, church_id);
    if (churchMismatch) return churchMismatch;

    if (!VALID_PRINTER_TYPES.includes(printer.printer_type as PrinterType)) {
      return NextResponse.json(
        { error: `Invalid printer_type. Must be one of: ${VALID_PRINTER_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify church exists
    const churchRef = adminDb.collection("churches").doc(church_id);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }

    // Default label size based on printer type
    const defaultLabelSize =
      printer.printer_type === "brother_ql"
        ? "DK-2251"
        : printer.printer_type === "zebra_zd"
          ? "2x1"
          : "30256";

    const printMethod = VALID_PRINT_METHODS.includes(printer.print_method as PrintMethod)
      ? printer.print_method as PrintMethod
      : "native_sdk";

    const connectionType = VALID_CONNECTION_TYPES.includes(printer.connection_type as PrinterConnectionType)
      ? printer.connection_type as PrinterConnectionType
      : "wifi";

    const printerConfig: PrinterConfig = {
      id: printer.station_name?.toLowerCase().replace(/\s+/g, "-") || "kiosk-1",
      station_name: printer.station_name || "Kiosk 1",
      printer_type: printer.printer_type as PrinterType,
      ip_address: printer.ip_address || "",
      label_size: (printer.label_size || defaultLabelSize) as LabelSize,
      print_server_url: printer.print_server_url,
      is_active: true,
      print_method: printMethod,
      connection_type: connectionType,
      bluetooth_address: printer.bluetooth_address,
      printer_model: printer.printer_model,
    };

    // Load existing settings or create new
    const settingsRef = churchRef.collection("checkinSettings").doc("config");
    const settingsSnap = await settingsRef.get();
    const existing = settingsSnap.exists ? settingsSnap.data()! : {};

    // Replace or add printer in the printers array
    const printers = (existing.printers as PrinterConfig[] || []).filter(
      (p) => p.id !== printerConfig.id,
    );
    printers.push(printerConfig);

    await settingsRef.set(
      { ...existing, printers },
      { merge: true },
    );

    return NextResponse.json({ success: true, printer: printerConfig });
  } catch (error) {
    console.error("[POST /api/checkin/printer-config]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
