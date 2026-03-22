import type { LabelJob, LabelPayload, PrinterConfig } from "@/lib/types";

export type { LabelJob, LabelPayload };

/**
 * PrinterAdapter generates label content for a given printer type.
 * The actual printing is handled by the companion print service on the church LAN —
 * these adapters only produce the label data (PNG, ZPL, or Dymo XML).
 */
export interface PrinterAdapter {
  generateLabel(job: LabelJob, config: PrinterConfig): Promise<LabelPayload>;
}
