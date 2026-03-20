/**
 * Generates a clean, document-style roster printout in a new browser window.
 * Follows the same window.open + auto-print pattern as print-flyer.ts.
 */

export interface PrintRosterRole {
  roleName: string;
  volunteers: {
    name: string;
    email?: string;
    status?: string;
  }[];
  totalSlots?: number;
}

export interface PrintRosterOptions {
  title: string;
  subtitle?: string;
  orgName: string;
  roles: PrintRosterRole[];
}

export function printRoster(options: PrintRosterOptions) {
  const now = new Date();
  const printedAt = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const totalFilled = options.roles.reduce((sum, r) => sum + r.volunteers.length, 0);
  const totalSlots = options.roles.reduce(
    (sum, r) => sum + (r.totalSlots ?? r.volunteers.length),
    0,
  );

  let tableRows = "";
  for (const role of options.roles) {
    // Role header row
    tableRows += `<tr class="role-header"><td colspan="4">${esc(role.roleName)}${
      role.totalSlots != null ? ` <span class="slot-count">(${role.volunteers.length}/${role.totalSlots})</span>` : ""
    }</td></tr>`;

    if (role.volunteers.length === 0) {
      tableRows += `<tr><td></td><td class="unfilled" colspan="3">(no volunteers)</td></tr>`;
    } else {
      for (const vol of role.volunteers) {
        tableRows += `<tr>
          <td></td>
          <td>${esc(vol.name)}</td>
          <td>${vol.email ? esc(vol.email) : ""}</td>
          <td>${vol.status ? esc(vol.status) : ""}</td>
        </tr>`;
      }
    }
    // Unfilled slots
    const unfilled = (role.totalSlots ?? 0) - role.volunteers.length;
    for (let i = 0; i < unfilled; i++) {
      tableRows += `<tr><td></td><td class="unfilled">(unfilled)</td><td></td><td></td></tr>`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(options.title)} — Roster</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #222;
      padding: 24px 32px;
      line-height: 1.4;
    }
    .header { margin-bottom: 20px; }
    .org-name {
      font-size: 10pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .title {
      font-size: 18pt;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .subtitle {
      font-size: 11pt;
      color: #555;
    }
    .summary {
      font-size: 10pt;
      color: #666;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
    }
    th {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 2px solid #333;
      font-weight: 600;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #444;
    }
    td {
      padding: 5px 8px;
      border-bottom: 1px solid #ddd;
      vertical-align: top;
    }
    .role-header td {
      font-weight: 700;
      font-size: 10.5pt;
      padding-top: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #999;
      background: #f5f5f5;
    }
    .slot-count {
      font-weight: 400;
      color: #888;
      font-size: 9pt;
    }
    .unfilled {
      color: #999;
      font-style: italic;
    }
    .footer {
      margin-top: 24px;
      font-size: 8pt;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 8px;
    }
    @media print {
      body { padding: 0; }
      @page { margin: 0.5in; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${esc(options.orgName)}</div>
    <div class="title">${esc(options.title)}</div>
    ${options.subtitle ? `<div class="subtitle">${esc(options.subtitle)}</div>` : ""}
  </div>
  <div class="summary">${totalFilled} of ${totalSlots} positions filled</div>
  <table>
    <thead>
      <tr>
        <th style="width:4%"></th>
        <th style="width:32%">Name</th>
        <th style="width:40%">Contact</th>
        <th style="width:24%">Status</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div class="footer">Printed from VolunteerCal &middot; ${esc(printedAt)}</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
