/**
 * Reminder email & SMS — sent before a volunteer's scheduled service.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  formatDateLong,
  BOLD,
} from "./base-layout";

export interface ReminderEmailData {
  volunteerName: string;
  churchName: string;
  serviceName: string;
  ministryName: string;
  roleTitle: string;
  serviceDate: string;
  startTime: string;
  hoursUntil: number;
  confirmUrl: string;
}

export function buildReminderEmail(data: ReminderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const formattedDate = formatDateLong(data.serviceDate);
  const timeLabel = data.hoursUntil <= 24 ? "tomorrow" : "in 2 days";

  const subject = `Reminder: You're serving ${timeLabel} — ${data.serviceName}`;

  const body = `
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4A4A6A;">
                Hi <strong ${BOLD}>${data.volunteerName}</strong>,
                just a reminder that you're scheduled to serve <strong ${BOLD}>${timeLabel}</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Date</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D3047;">${formattedDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Service</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D3047;">${data.serviceName}</span>
                          ${data.startTime ? `<span style="font-size:13px;color:#9A9BB5;"> &middot; ${data.startTime}</span>` : ""}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Your Role</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D3047;">${data.roleTitle}</span>
                          <span style="font-size:13px;color:#9A9BB5;"> &middot; ${data.ministryName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${ctaButton(data.confirmUrl, "View or Update Status", "#81B29A")}
              ${mutedCenter("Can't make it? Click above to let us know — no login required.")}`;

  const html = wrapInLayout({
    headerText: "Friendly Reminder",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Reminder: You're serving ${timeLabel} — ${data.churchName}

Hi ${data.volunteerName},

Just a reminder that you're scheduled to serve ${timeLabel}:

  Date: ${formattedDate}
  Service: ${data.serviceName}${data.startTime ? ` · ${data.startTime}` : ""}
  Role: ${data.roleTitle} · ${data.ministryName}

View or update your status (no login required):
${data.confirmUrl}

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}

// ─── SMS Message Builder ────────────────────────────────────────────────

export interface ReminderSmsData {
  volunteerName: string;
  churchName: string;
  serviceName: string;
  roleTitle: string;
  serviceDate: string;
  startTime: string;
  hoursUntil: number;
  confirmUrl: string;
}

export function buildReminderSms(data: ReminderSmsData): string {
  const firstName = data.volunteerName.split(" ")[0] || "Hi";
  const timeLabel = data.hoursUntil <= 24 ? "tomorrow" : "in 2 days";
  const formattedDate = formatDateLong(data.serviceDate);

  return `${firstName}, reminder: you're serving ${timeLabel} at ${data.churchName}.\n\n${data.serviceName} · ${data.roleTitle}\n${formattedDate}${data.startTime ? ` at ${data.startTime}` : ""}\n\nCan't make it? ${data.confirmUrl}\n\n— VolunteerCal`;
}
