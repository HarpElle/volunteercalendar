/** Confirmation email — sent when a volunteer is scheduled to serve. */

import {
  wrapInLayout,
  detailCard,
  detailRow,
  ctaButton,
  mutedCenter,
  formatDateLong,
  onBehalfFooter,
  BOLD,
} from "./base-layout";
import { escapeHtml } from "./escape";

export interface ConfirmationEmailData {
  volunteerName: string;
  churchName: string;
  serviceName: string;
  ministryName: string;
  roleTitle: string;
  serviceDate: string;
  startTime: string;
  confirmUrl: string;
}

export function buildConfirmationEmail(data: ConfirmationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const formattedDate = formatDateLong(data.serviceDate);

  const subject = `You're scheduled to serve \u2014 ${formattedDate}`;

  const body = `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4A4A6A;">
                Hi <strong ${BOLD}>${escapeHtml(data.volunteerName)}</strong>,
                you've been scheduled to serve. Please confirm your availability below.
              </p>

              <!-- Assignment Details -->
              ${detailCard(`<table width="100%" cellpadding="0" cellspacing="0">
                      ${detailRow("Date", formattedDate)}
                      ${detailRow("Service", data.serviceName, data.startTime)}
                      ${detailRow("Ministry", data.ministryName)}
                      <tr>
  <td>
    <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Your Role</span><br>
    <span style="font-size:15px;font-weight:600;color:#2D3047;">${escapeHtml(data.roleTitle)}</span>
  </td>
</tr>
                    </table>`)}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding-bottom:12px;">
      <a href="${data.confirmUrl}" style="display:inline-block;background-color:#81B29A;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
        Confirm or Decline
      </a>
    </td>
  </tr>
</table>

              ${mutedCenter("Click the button above to confirm your availability or let us know if you can't make it.\n                No login required.")}`;

  const html = wrapInLayout({
    headerText: "You're Scheduled to Serve",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `You're Scheduled to Serve \u2014 ${data.churchName}

Hi ${data.volunteerName},

You've been scheduled to serve:

  Date: ${formattedDate}
  Service: ${data.serviceName} \u00b7 ${data.startTime}
  Ministry: ${data.ministryName}
  Role: ${data.roleTitle}

Confirm or decline here (no login required):
${data.confirmUrl}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
