import QRCode from "qrcode";

interface FlyerOptions {
  title: string;
  subtitle?: string;
  orgName: string;
  url: string;
  /** Only displayed if it looks like a short URL (e.g., volunteercal.com/s/easter) */
  shortUrl?: string;
  instructions?: string[];
  /** e.g., "5 roles needed · 12 volunteers sought" */
  stats?: string;
}

/**
 * Opens a print dialog with a branded flyer containing a QR code.
 * Designed to fit on a single printed page.
 */
export async function printFlyer(options: FlyerOptions) {
  const qrDataUrl = await QRCode.toDataURL(options.url, {
    width: 360,
    margin: 2,
    color: { dark: "#2C2E5A", light: "#FFFFFF" },
  });

  // Only show URL text if it's a short URL
  const displayUrl = options.shortUrl || (isShortUrl(options.url) ? options.url : "");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${options.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 0.3in; size: letter; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: white;
      color: #2C2E5A;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 0;
    }
    .flyer {
      max-width: 540px;
      width: 100%;
      text-align: center;
      border: 3px solid #2C2E5A;
      border-radius: 20px;
      padding: 1.5rem 1.5rem 1rem;
    }
    .org-name {
      font-family: 'DM Serif Display', serif;
      font-size: 1.2rem;
      color: #2C2E5A;
      margin-bottom: 0.5rem;
    }
    .title {
      font-family: 'DM Serif Display', serif;
      font-size: 1.75rem;
      line-height: 1.2;
      margin-bottom: 0.2rem;
    }
    .subtitle {
      font-size: 0.95rem;
      color: #6B6D8A;
      margin-bottom: 1rem;
    }
    .stats {
      font-size: 0.8rem;
      color: #9A9BB5;
      margin-bottom: 0.75rem;
    }
    .qr-container {
      display: inline-block;
      padding: 0.5rem;
      border: 2px solid #EDEDE9;
      border-radius: 14px;
      margin-bottom: 0.5rem;
    }
    .qr-container img { width: 180px; height: 180px; }
    .instructions {
      list-style: none;
      margin: 0.75rem 0;
      padding: 0;
    }
    .instructions li {
      font-size: 0.85rem;
      padding: 0.2rem 0;
      color: #2C2E5A;
    }
    .instructions li strong { color: #E07A5F; }
    .url {
      font-size: 0.7rem;
      color: #9A9BB5;
      word-break: break-all;
      margin-top: 0.15rem;
    }
    .powered {
      margin-top: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid #EDEDE9;
      font-size: 0.65rem;
      color: #9A9BB5;
    }
    .powered .accent { color: #E07A5F; font-weight: 600; }
    @media print {
      body { padding: 0; }
      .flyer { border: 3px solid #2C2E5A; }
    }
  </style>
</head>
<body>
  <div class="flyer">
    <div class="org-name">${escapeHtml(options.orgName)}</div>
    <h1 class="title">${escapeHtml(options.title)}</h1>
    ${options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
    ${options.stats ? `<p class="stats">${escapeHtml(options.stats)}</p>` : ""}
    <div class="qr-container">
      <img src="${qrDataUrl}" alt="QR Code" />
    </div>
    ${displayUrl ? `<p class="url">${escapeHtml(displayUrl)}</p>` : ""}
    ${
      options.instructions && options.instructions.length > 0
        ? `<ol class="instructions">${options.instructions.map((s, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(s)}</li>`).join("")}</ol>`
        : ""
    }
    <div class="powered">Powered by Volunteer<span class="accent">Cal</span></div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Returns true if the URL looks short enough to display on a flyer. */
function isShortUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.length < 30;
  } catch {
    return url.length < 60;
  }
}
