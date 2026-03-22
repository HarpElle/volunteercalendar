import type { PrinterAdapter, LabelJob, LabelPayload } from "./types";
import type { PrinterConfig } from "@/lib/types";

/**
 * Zebra ZD label adapter — generates ZPL (Zebra Programming Language) text.
 *
 * ZPL is a human-readable DSL that Zebra printers interpret directly.
 * The resulting ZPL string is returned as label data; the kiosk client
 * sends it to the companion print service which forwards it via TCP/9100.
 */

function escapeZPL(text: string): string {
  // ZPL uses ^ as control char — escape by doubling
  return text.replace(/\^/g, "^^");
}

function buildChildLabelZPL(job: LabelJob): string {
  const alertBlock = job.has_allergy_alert
    ? `^FO0,0^GB406,28,28^FS^FO5,5^FR^A0N,18,18^FD${escapeZPL(`⚠ ${(job.allergy_text || "ALLERGY").toUpperCase()} - SEE TEACHER`)}^FS`
    : "";
  const yOffset = job.has_allergy_alert ? 32 : 8;

  return `^XA
^CI28
${alertBlock}
^FO8,${yOffset}^A0N,28,28^FD${escapeZPL((job.child_name ?? "").toUpperCase())}^FS
^FO8,${yOffset + 34}^A0N,18,18^FD${escapeZPL(job.room_name ?? "")}^FS
^FO8,${yOffset + 56}^A0N,16,16^FD${escapeZPL(job.service_date)}^FS
^FO240,${yOffset + 8}^A0N,48,36^FD${escapeZPL(job.security_code)}^FS
^XZ`.trim();
}

function buildParentStubZPL(job: LabelJob): string {
  const names = (job.child_names ?? []).join(", ");
  return `^XA
^CI28
^FO10,5^A0N,14,14^FD${escapeZPL(job.church_name)}  ${escapeZPL(job.service_date)}^FS
^FO10,22^A0N,48,40^FD${escapeZPL(job.security_code)}^FS
^FO10,76^A0N,16,16^FD${escapeZPL(names)}^FS
^XZ`.trim();
}

export class ZebraZDAdapter implements PrinterAdapter {
  async generateLabel(
    job: LabelJob,
    config: PrinterConfig,
  ): Promise<LabelPayload> {
    const zpl =
      job.type === "child_label"
        ? buildChildLabelZPL(job)
        : buildParentStubZPL(job);

    return {
      format: "zpl",
      data: zpl,
      printer_id: config.id,
    };
  }
}
