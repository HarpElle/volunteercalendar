import QRCode from "qrcode";

interface SlideOptions {
  title: string;
  subtitle?: string;
  orgName: string;
  url: string;
  /** Optional short URL to display (e.g., volunteercal.com/s/easter) */
  shortUrl?: string;
}

/**
 * Generates a 1920×1080 branded slide image with a QR code and triggers
 * a download. Intended for display on presentation screens at venues.
 * Uses the Canvas API — runs entirely client-side.
 */
export async function downloadSlide(options: SlideOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d")!;

  // --- Background: warm ivory gradient ---
  const bg = ctx.createLinearGradient(0, 0, 1920, 1080);
  bg.addColorStop(0, "#FEFCF9");
  bg.addColorStop(1, "#FBF7F0");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1920, 1080);

  // --- Subtle border frame ---
  ctx.strokeStyle = "#2C2E5A";
  ctx.lineWidth = 4;
  roundRect(ctx, 40, 40, 1840, 1000, 32);
  ctx.stroke();

  // --- QR Code (right side) ---
  const qrDataUrl = await QRCode.toDataURL(options.url, {
    width: 420,
    margin: 2,
    color: { dark: "#2C2E5A", light: "#FFFFFF" },
  });

  const qrImg = await loadImage(qrDataUrl);
  // QR container with rounded border
  const qrX = 1340;
  const qrY = 250;
  const qrSize = 420;
  const qrPadding = 24;

  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, qrX - qrPadding, qrY - qrPadding, qrSize + qrPadding * 2, qrSize + qrPadding * 2, 20);
  ctx.fill();
  ctx.strokeStyle = "#EDEDE9";
  ctx.lineWidth = 2;
  roundRect(ctx, qrX - qrPadding, qrY - qrPadding, qrSize + qrPadding * 2, qrSize + qrPadding * 2, 20);
  ctx.stroke();

  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // URL below QR
  const displayUrl = options.shortUrl || options.url;
  ctx.fillStyle = "#9A9BB5";
  ctx.font = "400 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(displayUrl, qrX + qrSize / 2, qrY + qrSize + qrPadding + 40);

  // --- Text content (left side) ---
  const textX = 120;
  const maxTextWidth = 1140;

  // VolunteerCal logo text
  ctx.textAlign = "left";
  ctx.fillStyle = "#2C2E5A";
  ctx.font = "700 28px sans-serif";
  ctx.fillText("Volunteer", textX, 140);
  const volunteerWidth = ctx.measureText("Volunteer").width;
  ctx.fillStyle = "#E07A5F";
  ctx.fillText("Cal", textX + volunteerWidth, 140);

  // Org name
  ctx.fillStyle = "#2C2E5A";
  ctx.font = "400 36px serif";
  ctx.fillText(options.orgName, textX, 280);

  // Title (large, possibly multi-line)
  ctx.fillStyle = "#2C2E5A";
  ctx.font = "700 72px serif";
  const titleLines = wrapText(ctx, options.title, maxTextWidth);
  let titleY = 380;
  for (const line of titleLines) {
    ctx.fillText(line, textX, titleY);
    titleY += 88;
  }

  // Subtitle
  if (options.subtitle) {
    ctx.fillStyle = "#6B6D8A";
    ctx.font = "400 32px sans-serif";
    const subLines = wrapText(ctx, options.subtitle, maxTextWidth);
    let subY = titleY + 20;
    for (const line of subLines) {
      ctx.fillText(line, textX, subY);
      subY += 44;
    }
  }

  // "Scan to sign up" callout
  ctx.fillStyle = "#E07A5F";
  ctx.font = "500 28px sans-serif";
  ctx.fillText("Scan the QR code to sign up \u2192", textX, 780);

  // Footer
  ctx.fillStyle = "#9A9BB5";
  ctx.font = "400 18px sans-serif";
  ctx.fillText("Powered by VolunteerCal", textX, 980);

  // --- Trigger download ---
  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${slugify(options.title)}-slide.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
