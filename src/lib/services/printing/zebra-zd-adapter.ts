import type { PrinterAdapter, LabelJob, LabelPayload } from "./types";
import type { PrinterConfig } from "@/lib/types";

/**
 * Zebra ZD label adapter.
 *
 * Default output is a PNG image (Antigravity finding / Jason 2026-06-23):
 * Zebra ZD printers enrolled as `native_sdk` route to the AirPrint plugin
 * (see detectPrintPath in kiosk-print-bridge), which prints IMAGES and
 * cannot interpret raw ZPL. Mirroring the Brother adapter — rendering the
 * label as a PNG — makes Zebra work over AirPrint. The kiosk sends the
 * base64 PNG to the OS print path.
 *
 * The raw ZPL builders (`buildChildLabelZPL` / `buildParentStubZPL`) are
 * still exported for the companion-print-server path (raw TCP/9100 to a
 * Zebra), should that ever be reinstated — but they are NOT the default
 * output because no live path consumes raw ZPL today.
 */

// Zebra ZD label canvas — 4"×2" @ ~200dpi proportions. AirPrint scales the
// image to the loaded media, so the aspect ratio + legibility matter more
// than exact pixels. Larger pixels keep text crisp after scaling.
const ZEBRA_CHILD_DIMS = { width: 812, height: 406 };
const ZEBRA_PARENT_DIMS = { width: 812, height: 406 };

async function getCanvas() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  } catch {
    throw new Error(
      "@napi-rs/canvas is not installed. Run: npm install @napi-rs/canvas",
    );
  }
}

function escapeZPL(text: string): string {
  // ZPL uses ^ as control char — escape by doubling
  return text.replace(/\^/g, "^^");
}

/** Raw ZPL builder — kept for a potential raw TCP/9100 path (not default). */
export function buildChildLabelZPL(job: LabelJob): string {
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

/** Raw ZPL builder — kept for a potential raw TCP/9100 path (not default). */
export function buildParentStubZPL(job: LabelJob): string {
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
    return job.type === "child_label"
      ? this.renderChildLabel(job, config.id)
      : this.renderParentStub(job, config.id);
  }

  private async renderChildLabel(
    job: LabelJob,
    printerId: string,
  ): Promise<LabelPayload> {
    const { createCanvas } = await getCanvas();
    const dims = ZEBRA_CHILD_DIMS;
    const canvas = createCanvas(dims.width, dims.height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, dims.width, dims.height);

    let yOffset: number;
    if (job.has_allergy_alert) {
      const bannerHeight = 72;
      ctx.fillStyle = "#000000"; // Zebra ZD is monochrome — solid black banner
      ctx.fillRect(0, 0, dims.width, bannerHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `⚠ ${(job.allergy_text || "ALLERGY ALERT").toUpperCase()}`,
        dims.width / 2,
        40,
      );
      ctx.font = "20px sans-serif";
      ctx.fillText("SEE TEACHER", dims.width / 2, 64);
      yOffset = bannerHeight + 16;
    } else {
      yOffset = 24;
    }

    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.font = "bold 52px sans-serif";
    ctx.fillText((job.child_name || "").toUpperCase(), 24, yOffset + 50, dims.width - 300);

    ctx.font = "26px sans-serif";
    ctx.fillText(job.room_name || "", 24, yOffset + 92, dims.width - 300);

    ctx.font = "22px sans-serif";
    ctx.fillStyle = "#444444";
    ctx.fillText(job.service_date, 24, yOffset + 128);

    // Security code — large, right side
    ctx.fillStyle = "#000000";
    ctx.font = "bold 64px monospace";
    ctx.textAlign = "right";
    ctx.fillText(job.security_code, dims.width - 24, yOffset + 92);

    const buffer = canvas.toBuffer("image/png");
    return { format: "png", data: buffer.toString("base64"), printer_id: printerId };
  }

  private async renderParentStub(
    job: LabelJob,
    printerId: string,
  ): Promise<LabelPayload> {
    const { createCanvas } = await getCanvas();
    const dims = ZEBRA_PARENT_DIMS;
    const canvas = createCanvas(dims.width, dims.height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, dims.width, dims.height);

    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.font = "22px sans-serif";
    ctx.fillText(`${job.church_name}   ${job.service_date}`, dims.width / 2, 40);

    ctx.font = "bold 96px monospace";
    ctx.fillText(job.security_code, dims.width / 2, 180);

    const names = (job.child_names ?? []).join(", ");
    ctx.font = "26px sans-serif";
    ctx.fillText(names, dims.width / 2, 250, dims.width - 48);

    const buffer = canvas.toBuffer("image/png");
    return { format: "png", data: buffer.toString("base64"), printer_id: printerId };
  }
}
