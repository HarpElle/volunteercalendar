import QRCode from "qrcode";

interface FlyerOptions {
  title: string;
  subtitle?: string;
  orgName: string;
  url: string;
  instructions?: string[];
  footer?: string;
}

/**
 * Opens a print dialog with a branded flyer containing a QR code.
 * Works entirely client-side — generates HTML and opens browser print.
 */
export async function printFlyer(options: FlyerOptions) {
  const qrDataUrl = await QRCode.toDataURL(options.url, {
    width: 400,
    margin: 2,
    color: { dark: "#2C2E5A", light: "#FFFFFF" },
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${options.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: white;
      color: #2C2E5A;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .flyer {
      max-width: 600px;
      width: 100%;
      text-align: center;
      border: 3px solid #2C2E5A;
      border-radius: 24px;
      padding: 3rem 2.5rem;
    }
    .logo {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 2rem;
    }
    .logo .accent { color: #E07A5F; }
    .title {
      font-family: 'DM Serif Display', serif;
      font-size: 2.25rem;
      line-height: 1.2;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      font-size: 1.1rem;
      color: #6B6D8A;
      margin-bottom: 2rem;
    }
    .qr-container {
      display: inline-block;
      padding: 1rem;
      border: 2px solid #EDEDE9;
      border-radius: 16px;
      margin-bottom: 1.5rem;
    }
    .qr-container img { width: 250px; height: 250px; }
    .instructions {
      list-style: none;
      margin: 1.5rem 0;
      padding: 0;
    }
    .instructions li {
      font-size: 1rem;
      padding: 0.4rem 0;
      color: #2C2E5A;
    }
    .instructions li strong { color: #E07A5F; }
    .url {
      font-size: 0.8rem;
      color: #9A9BB5;
      word-break: break-all;
      margin-top: 0.5rem;
    }
    .footer {
      margin-top: 2rem;
      font-size: 0.75rem;
      color: #9A9BB5;
    }
    .org-name {
      font-family: 'DM Serif Display', serif;
      font-size: 1.5rem;
      color: #2C2E5A;
      margin-bottom: 1.5rem;
    }
    @media print {
      body { padding: 0; }
      .flyer { border: 3px solid #2C2E5A; }
    }
  </style>
</head>
<body>
  <div class="flyer">
    <div class="logo">Volunteer<span class="accent">Cal</span></div>
    <div class="org-name">${escapeHtml(options.orgName)}</div>
    <h1 class="title">${escapeHtml(options.title)}</h1>
    ${options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
    <div class="qr-container">
      <img src="${qrDataUrl}" alt="QR Code" />
    </div>
    ${
      options.instructions && options.instructions.length > 0
        ? `<ol class="instructions">${options.instructions.map((s, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(s)}</li>`).join("")}</ol>`
        : ""
    }
    <p class="url">${escapeHtml(options.url)}</p>
    ${options.footer ? `<p class="footer">${escapeHtml(options.footer)}</p>` : ""}
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
