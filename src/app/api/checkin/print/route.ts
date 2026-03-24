import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { getPrinterAdapter } from "@/lib/services/printing";
import type {
  CheckInSession,
  LabelJob,
  LabelPayload,
  PrinterConfig,
} from "@/lib/types";

/**
 * POST /api/checkin/print
 * Unauthenticated kiosk endpoint — reprints labels for existing sessions.
 * Does NOT create new sessions or generate new security codes.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { church_id, session_ids, station_id } = body as {
      church_id: string;
      session_ids: string[];
      station_id?: string;
    };

    if (!church_id || !session_ids?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Load church name
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }
    const churchName = churchSnap.data()!.name as string;

    // Load printer config
    const settingsSnap = await churchRef
      .collection("checkinSettings")
      .doc("config")
      .get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : null;

    let printerConfig: PrinterConfig | null = null;
    if (settings?.printers?.length) {
      const printers = settings.printers as PrinterConfig[];
      if (station_id) {
        printerConfig =
          printers.find((p) => p.id === station_id && p.is_active) || null;
      }
      if (!printerConfig) {
        printerConfig = printers.find((p) => p.is_active) || null;
      }
    }

    if (!printerConfig) {
      return NextResponse.json(
        { error: "No active printer configured" },
        { status: 422 },
      );
    }

    // Load sessions and generate labels
    const labelPayloads: LabelPayload[] = [];
    const childNames: string[] = [];
    let securityCode = "";
    let serviceDate = "";
    let anyAlerts = false;

    for (const sessionId of session_ids) {
      const sessionSnap = await churchRef
        .collection("checkInSessions")
        .doc(sessionId)
        .get();
      if (!sessionSnap.exists) continue;
      const session = sessionSnap.data() as CheckInSession;

      // Use the security code from the first session (all should share the same code)
      if (!securityCode) {
        securityCode = session.security_code;
        serviceDate = session.service_date;
      }

      // Load child data for name
      const childSnap = await churchRef
        .collection("children")
        .doc(session.child_id)
        .get();
      if (!childSnap.exists) continue;
      const child = childSnap.data()!;

      const displayName = child.preferred_name || child.first_name;
      const fullName = `${displayName} ${child.last_name}`;
      childNames.push(displayName);

      if (child.has_alerts) anyAlerts = true;

      // Generate child label
      const labelJob: LabelJob = {
        type: "child_label",
        child_name: fullName,
        room_name: session.room_name,
        service_date: formatDateForLabel(session.service_date),
        security_code: session.security_code,
        church_name: churchName,
        has_allergy_alert: child.has_alerts,
        allergy_text: child.allergies || undefined,
      };

      try {
        const adapter = getPrinterAdapter(printerConfig.printer_type);
        const payload = await adapter.generateLabel(labelJob, printerConfig);
        labelPayloads.push(payload);
      } catch {
        // Label generation failure — non-blocking
      }
    }

    // Generate parent stub
    if (childNames.length > 0) {
      const stubJob: LabelJob = {
        type: "parent_stub",
        child_names: childNames,
        service_date: formatDateForLabel(serviceDate),
        security_code: securityCode,
        church_name: churchName,
        has_allergy_alert: anyAlerts,
      };
      try {
        const adapter = getPrinterAdapter(printerConfig.printer_type);
        const payload = await adapter.generateLabel(stubJob, printerConfig);
        labelPayloads.push(payload);
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({
      label_payloads: labelPayloads,
      print_server_url: printerConfig.print_server_url || null,
      // Native kiosk app uses this to route to Brother SDK / AirPrint
      printer_config: {
        print_method: printerConfig.print_method || "print_server",
        printer_type: printerConfig.printer_type,
        connection_type: printerConfig.connection_type,
        bluetooth_address: printerConfig.bluetooth_address,
        ip_address: printerConfig.ip_address,
        label_size: printerConfig.label_size,
        printer_model: printerConfig.printer_model,
      },
    });
  } catch (error) {
    console.error("[POST /api/checkin/print]", error);
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
