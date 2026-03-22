import type { PrinterAdapter, LabelJob, LabelPayload } from "./types";
import type { PrinterConfig, BrotherLabelSize } from "@/lib/types";

/**
 * Brother QL label adapter — generates PNG label images at 300dpi.
 *
 * Uses @napi-rs/canvas (Rust-based, Vercel-compatible) to render labels.
 * The resulting PNG is returned as a base64 string; the kiosk client sends
 * it to the companion print service on the church LAN for actual printing.
 *
 * Label sizes at 300dpi:
 *   DK-2251: 732px wide, continuous (variable height)
 *   DK-1201: 342px × 1063px (29mm × 90mm)
 *   DK-2205: 732px wide, continuous (monochrome)
 */

// Dynamically import canvas to avoid build errors if not installed
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

const LABEL_CONFIGS: Record<
  BrotherLabelSize,
  { width: number; height: number }
> = {
  "DK-2251": { width: 732, height: 830 }, // 62mm continuous, cut to ~70mm
  "DK-1201": { width: 342, height: 1063 }, // 29mm × 90mm die-cut
  "DK-2205": { width: 732, height: 830 }, // 62mm continuous, monochrome
};

export class BrotherQLAdapter implements PrinterAdapter {
  async generateLabel(
    job: LabelJob,
    config: PrinterConfig,
  ): Promise<LabelPayload> {
    const labelSize = (config.label_size as BrotherLabelSize) || "DK-2251";

    if (job.type === "child_label") {
      return this.renderChildLabel(job, labelSize, config.id);
    }
    return this.renderParentStub(job, labelSize, config.id);
  }

  private async renderChildLabel(
    job: LabelJob,
    size: BrotherLabelSize,
    printerId: string,
  ): Promise<LabelPayload> {
    const { createCanvas } = await getCanvas();
    const dims = LABEL_CONFIGS[size] || LABEL_CONFIGS["DK-2251"];
    const canvas = createCanvas(dims.width, dims.height);
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, dims.width, dims.height);

    let yOffset = 0;

    // Allergy alert banner (red background)
    if (job.has_allergy_alert) {
      const bannerHeight = 80;
      // DK-2251 supports red+black; others get dark grey
      ctx.fillStyle = size === "DK-2251" ? "#CC0000" : "#333333";
      ctx.fillRect(0, 0, dims.width, bannerHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `⚠ ${(job.allergy_text || "ALLERGY ALERT").toUpperCase()}`,
        dims.width / 2,
        50,
      );
      ctx.font = "20px sans-serif";
      ctx.fillText("SEE TEACHER", dims.width / 2, 72);
      yOffset = bannerHeight + 16;
    } else {
      yOffset = 24;
    }

    // Child name
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText(
      (job.child_name || "").toUpperCase(),
      24,
      yOffset + 48,
      dims.width - 48,
    );

    // Room name
    ctx.font = "24px sans-serif";
    ctx.fillText(job.room_name || "", 24, yOffset + 90, dims.width - 48);

    // Service date
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#666666";
    ctx.fillText(job.service_date, 24, yOffset + 125);

    // Security code (large, centered, monospace)
    ctx.fillStyle = "#000000";
    ctx.font = "bold 72px monospace";
    ctx.textAlign = "center";
    const codeY = Math.max(yOffset + 220, dims.height - 120);
    // Code box
    const codeWidth = 280;
    const codeHeight = 100;
    const codeX = dims.width / 2 - codeWidth / 2;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeRect(codeX, codeY - 70, codeWidth, codeHeight);
    ctx.fillText(job.security_code, dims.width / 2, codeY);

    const buffer = canvas.toBuffer("image/png");
    return {
      format: "png",
      data: buffer.toString("base64"),
      printer_id: printerId,
    };
  }

  private async renderParentStub(
    job: LabelJob,
    size: BrotherLabelSize,
    printerId: string,
  ): Promise<LabelPayload> {
    const { createCanvas } = await getCanvas();
    // Parent stub uses DK-1201 dimensions regardless of configured size
    const dims = LABEL_CONFIGS["DK-1201"];
    const canvas = createCanvas(dims.width, dims.height);
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, dims.width, dims.height);

    // Church name + date (top, small)
    ctx.fillStyle = "#000000";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(job.church_name, dims.width / 2, 30);
    ctx.font = "16px sans-serif";
    ctx.fillText(job.service_date, dims.width / 2, 54);

    // Divider
    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 68);
    ctx.lineTo(dims.width - 16, 68);
    ctx.stroke();

    // Security code (large, centered)
    ctx.font = "bold 56px monospace";
    ctx.fillStyle = "#000000";
    ctx.fillText(job.security_code, dims.width / 2, 140);

    // Divider
    ctx.beginPath();
    ctx.moveTo(16, 165);
    ctx.lineTo(dims.width - 16, 165);
    ctx.stroke();

    // Child names
    const names = (job.child_names ?? []).join(", ");
    ctx.font = "20px sans-serif";
    ctx.fillText(names, dims.width / 2, 195, dims.width - 32);

    const buffer = canvas.toBuffer("image/png");
    return {
      format: "png",
      data: buffer.toString("base64"),
      printer_id: printerId,
    };
  }
}
