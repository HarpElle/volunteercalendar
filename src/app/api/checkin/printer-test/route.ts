/**
 * POST /api/checkin/printer-test
 *
 * Generate a realistic test-label payload for the kiosk's current
 * printer config. The kiosk reads its config from localStorage
 * (`vc_kiosk_printer`) and passes the relevant fields here. The server
 * loads the right adapter, builds a "Test Child" label with allergy
 * alert + security code "T3ST", and returns the payload — the kiosk
 * then ships it to the companion print service via the same
 * `printLabels()` path real check-ins use.
 *
 * Auth: kiosk token with `print` scope. Bootstrap tokens are allowed
 * (the wizard runs before any station is enrolled).
 *
 * Mirror of /api/admin/checkin/printer/test, which is the admin-side
 * equivalent that loads printer config from Firestore. This endpoint
 * accepts config in the body because the kiosk owns its config
 * locally; the admin endpoint reads from the admin-managed list.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireKioskToken, assertKioskChurchMatch } from "@/lib/server/authz";
import { getPrinterAdapter } from "@/lib/services/printing";
import type {
  LabelJob,
  PrinterConfig,
  PrinterType,
  BrotherLabelSize,
  ZebraLabelSize,
  DymoLabelSize,
} from "@/lib/types";

interface PostBody {
  church_id?: string;
  printer_type?: PrinterType;
  label_size?: BrotherLabelSize | ZebraLabelSize | DymoLabelSize;
  /** Optional override for the test label's child name. Defaults to
   *  "Test Child". Lets the kiosk caller customize the on-paper text
   *  (e.g. "TEST: Lobby Kiosk") if helpful. */
  child_name?: string;
}

export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "print");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = (await req.json()) as PostBody;
    const churchId = body.church_id ?? "";
    if (!churchId) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }
    const churchMismatch = assertKioskChurchMatch(kiosk, churchId);
    if (churchMismatch) return churchMismatch;

    const printerType = body.printer_type;
    if (!printerType) {
      return NextResponse.json(
        { error: "Missing printer_type" },
        { status: 400 },
      );
    }

    // Load church name for the label.
    const churchSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .get();
    const churchName = churchSnap.exists
      ? (churchSnap.data()!.name as string)
      : "Test Church";

    // Build a minimal PrinterConfig — only the fields the adapter
    // needs for label generation. Network fields (ip_address, port)
    // aren't needed here; the kiosk handles transport via printLabels().
    const printerConfig: PrinterConfig = {
      id: "kiosk-test",
      station_name: "Kiosk Test",
      printer_type: printerType,
      ip_address: "",
      label_size: (body.label_size ?? defaultLabelSize(printerType)) as
        | BrotherLabelSize
        | ZebraLabelSize
        | DymoLabelSize,
      is_active: true,
    };

    const testJob: LabelJob = {
      type: "child_label",
      child_name: body.child_name?.trim() || "Test Child",
      room_name: "Test Room",
      service_date: formatDateForLabel(new Date().toISOString().split("T")[0]),
      security_code: "T3ST",
      church_name: churchName,
      has_allergy_alert: true,
      allergy_text: "Peanuts (TEST)",
    };

    const adapter = getPrinterAdapter(printerType);
    const payload = await adapter.generateLabel(testJob, printerConfig);

    return NextResponse.json({ label_payload: payload });
  } catch (error) {
    console.error("[POST /api/checkin/printer-test]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function defaultLabelSize(type: PrinterType): string {
  if (type === "brother_ql") return "DK-2251";
  if (type === "zebra_zd") return "2x1";
  if (type === "dymo_labelwriter") return "30321";
  return "DK-2251";
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
