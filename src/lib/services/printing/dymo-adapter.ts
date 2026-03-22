import type { PrinterAdapter, LabelJob, LabelPayload } from "./types";
import type { PrinterConfig } from "@/lib/types";

/**
 * Dymo LabelWriter adapter — generates Dymo label XML payload.
 *
 * Unlike Brother/Zebra, Dymo printing is handled entirely client-side:
 * the kiosk browser uses the @dymo/dymo-connect SDK to send the XML
 * to the local Dymo Connect service running on the kiosk device.
 *
 * This adapter only generates the XML label content.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildChildLabelXml(job: LabelJob): string {
  const alertLine = job.has_allergy_alert
    ? `<TextObject><Name>Alert</Name><Text>${escapeXml(`⚠ ${(job.allergy_text || "ALLERGY ALERT").toUpperCase()}`)}</Text><FontSize>8</FontSize><FontBold>True</FontBold></TextObject>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0">
  <PaperOrientation>Landscape</PaperOrientation>
  <ObjectInfo>
    ${alertLine}
    <TextObject>
      <Name>ChildName</Name>
      <Text>${escapeXml((job.child_name ?? "").toUpperCase())}</Text>
      <FontSize>14</FontSize>
      <FontBold>True</FontBold>
    </TextObject>
    <TextObject>
      <Name>RoomDate</Name>
      <Text>${escapeXml(`${job.room_name ?? ""} — ${job.service_date}`)}</Text>
      <FontSize>8</FontSize>
    </TextObject>
    <TextObject>
      <Name>SecurityCode</Name>
      <Text>${escapeXml(job.security_code)}</Text>
      <FontSize>18</FontSize>
      <FontBold>True</FontBold>
    </TextObject>
  </ObjectInfo>
</DieCutLabel>`;
}

function buildParentStubXml(job: LabelJob): string {
  const names = (job.child_names ?? []).join(", ");
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0">
  <PaperOrientation>Landscape</PaperOrientation>
  <ObjectInfo>
    <TextObject>
      <Name>Header</Name>
      <Text>${escapeXml(`${job.church_name} — ${job.service_date}`)}</Text>
      <FontSize>7</FontSize>
    </TextObject>
    <TextObject>
      <Name>SecurityCode</Name>
      <Text>${escapeXml(job.security_code)}</Text>
      <FontSize>18</FontSize>
      <FontBold>True</FontBold>
    </TextObject>
    <TextObject>
      <Name>Children</Name>
      <Text>${escapeXml(names)}</Text>
      <FontSize>8</FontSize>
    </TextObject>
  </ObjectInfo>
</DieCutLabel>`;
}

export class DymoAdapter implements PrinterAdapter {
  async generateLabel(
    job: LabelJob,
    config: PrinterConfig,
  ): Promise<LabelPayload> {
    const xml =
      job.type === "child_label"
        ? buildChildLabelXml(job)
        : buildParentStubXml(job);

    return {
      format: "dymo_xml",
      data: xml,
      printer_id: config.id,
    };
  }
}
