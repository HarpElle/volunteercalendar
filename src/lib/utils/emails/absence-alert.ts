/**
 * Absence alert email — sent to schedulers/admins when a volunteer
 * notifies they can't make it to an assignment or event.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  detailCard,
  detailRow,
  formatDateLong,
  P,
  BOLD,
} from "./base-layout";

export interface AbsenceAlertData {
  recipientName: string;
  volunteerName: string;
  churchName: string;
  serviceName: string;
  serviceDate: string;
  roleName: string;
  note: string | null;
}

export function buildAbsenceAlertEmail(data: AbsenceAlertData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.recipientName.split(" ")[0] || "there";
  const dateStr = formatDateLong(data.serviceDate);

  const subject = `Absence alert \u2014 ${data.volunteerName} can\u2019t make ${data.roleName} on ${dateStr}`;

  const rows = [
    detailRow("Volunteer", data.volunteerName),
    detailRow("Service/Event", data.serviceName),
    detailRow("Date", dateStr),
    detailRow("Role", data.roleName),
  ].join("");

  const card = detailCard(
    `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
  );

  const noteBlock = data.note
    ? `<div style="margin:16px 0;padding:12px 16px;background:#FBF7F0;border-left:3px solid #D4A574;border-radius:4px;font-size:14px;color:#4A4A6A;line-height:1.6;">
        <strong ${BOLD}>Note from ${data.volunteerName}:</strong><br/>
        ${data.note.replace(/\n/g, "<br/>")}
      </div>`
    : "";

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                <strong ${BOLD}>${data.volunteerName}</strong> has let you know they can't make it for <strong ${BOLD}>${data.roleName}</strong> at <strong ${BOLD}>${data.serviceName}</strong> on ${dateStr}.
              </p>

              ${card}
              ${noteBlock}

              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                This role may need to be reassigned. Please review and fill the opening.
              </p>

              ${ctaButton("https://volunteercal.org/dashboard/scheduling-dashboard", "View Dashboard")}

              ${mutedCenter("You're receiving this because you manage schedules affected by this change.")}`;

  const html = wrapInLayout({
    headerText: "Absence Alert",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Absence Alert — ${data.churchName}

Hi ${firstName},

${data.volunteerName} has let you know they can't make it for ${data.roleName} at ${data.serviceName} on ${dateStr}.

Volunteer: ${data.volunteerName}
Service/Event: ${data.serviceName}
Date: ${dateStr}
Role: ${data.roleName}
${data.note ? `\nNote: ${data.note}\n` : ""}
This role may need to be reassigned.

View Dashboard: https://volunteercal.org/dashboard/scheduling-dashboard

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
