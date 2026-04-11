/** Batched confirmation email — bundles all assignments for a volunteer into one message. */

import {
  wrapInLayout,
  detailCard,
  detailRow,
  mutedCenter,
  formatDateLong,
  onBehalfFooter,
  BOLD,
} from "./base-layout";

export interface BatchAssignment {
  serviceDate: string;
  serviceName: string;
  startTime: string;
  ministryName: string;
  roleTitle: string;
  confirmUrl: string;
}

export interface BatchConfirmationEmailData {
  volunteerName: string;
  churchName: string;
  assignments: BatchAssignment[];
}

export function buildBatchConfirmationEmail(
  data: BatchConfirmationEmailData,
): { subject: string; html: string; text: string } {
  const count = data.assignments.length;
  const subject =
    count === 1
      ? `You're scheduled to serve \u2014 ${formatDateLong(data.assignments[0].serviceDate)}`
      : `You're scheduled to serve \u2014 ${count} assignments`;

  // Build assignment cards
  const cards = data.assignments
    .map(
      (a) => `
      ${detailCard(`<table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow("Date", formatDateLong(a.serviceDate))}
        ${detailRow("Service", a.serviceName, a.startTime)}
        ${detailRow("Ministry", a.ministryName)}
        <tr>
          <td>
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Your Role</span><br>
            <span style="font-size:15px;font-weight:600;color:#2D3047;">${a.roleTitle}</span>
          </td>
        </tr>
      </table>`)}
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding-bottom:20px;">
            <a href="${a.confirmUrl}" style="display:inline-block;background-color:#81B29A;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:12px;letter-spacing:-0.2px;">
              Confirm or Decline
            </a>
          </td>
        </tr>
      </table>`,
    )
    .join("");

  const body = `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4A4A6A;">
    Hi <strong ${BOLD}>${data.volunteerName}</strong>,
    you've been scheduled to serve${count > 1 ? ` for ${count} upcoming dates` : ""}. Please review and confirm each assignment below.
  </p>
  ${cards}
  ${mutedCenter("Click each button to confirm your availability or let us know if you can't make it. No login required.")}`;

  const html = wrapInLayout({
    headerText: "You're Scheduled to Serve",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const assignmentLines = data.assignments
    .map(
      (a) =>
        `  Date: ${formatDateLong(a.serviceDate)}
  Service: ${a.serviceName} \u00b7 ${a.startTime}
  Ministry: ${a.ministryName}
  Role: ${a.roleTitle}
  Confirm: ${a.confirmUrl}`,
    )
    .join("\n\n");

  const text = `You're Scheduled to Serve \u2014 ${data.churchName}

Hi ${data.volunteerName},

You've been scheduled to serve${count > 1 ? ` for ${count} upcoming dates` : ""}:

${assignmentLines}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
