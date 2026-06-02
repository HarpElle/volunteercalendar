/**
 * Assignment-change email — sent to a volunteer when an admin/scheduler
 * removes or moves their assignment.
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
import { escapeHtml } from "./escape";

export interface AssignmentChangeEmailData {
  volunteerName: string;
  churchName: string;
  action: "removed" | "moved";
  serviceName: string;
  serviceDate: string;
  oldRole: string;
  newRole?: string;
  changedByName: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildAssignmentChangeEmail(data: AssignmentChangeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";
  const dateStr = formatDateLong(data.serviceDate);

  const subject =
    data.action === "removed"
      ? `Schedule update \u2014 removed from ${data.oldRole} on ${dateStr}`
      : `Schedule update \u2014 moved to ${data.newRole} on ${dateStr}`;

  const rows =
    data.action === "removed"
      ? [
          detailRow("Service", data.serviceName),
          detailRow("Date", dateStr),
          detailRow("Role", data.oldRole),
          detailRow("Action", "Removed from assignment"),
        ].join("")
      : [
          detailRow("Service", data.serviceName),
          detailRow("Date", dateStr),
          detailRow("Previous Role", data.oldRole),
          detailRow("New Role", data.newRole || "—"),
        ].join("");

  const card = detailCard(
    `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
  );

  const actionText =
    data.action === "removed"
      ? `you have been removed from <strong ${BOLD}>${escapeHtml(data.oldRole)}</strong>`
      : `you have been moved from <strong ${BOLD}>${escapeHtml(data.oldRole)}</strong> to <strong ${BOLD}>${escapeHtml(data.newRole)}</strong>`;

  const body = `
              <p ${P}>
                Hi ${escapeHtml(firstName)},
              </p>
              <p ${P}>
                ${escapeHtml(data.changedByName)} has updated your schedule at <strong ${BOLD}>${escapeHtml(data.churchName)}</strong> — ${actionText} for <strong ${BOLD}>${escapeHtml(data.serviceName)}</strong> on ${escapeHtml(dateStr)}.
              </p>

              ${card}

              ${ctaButton("https://volunteercal.com/dashboard/my-schedule", "View My Schedule")}

              ${mutedCenter("You're receiving this because your volunteer schedule was updated.")}`;

  const html = wrapInLayout({
    headerText: "Schedule Update",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Schedule Update — ${data.churchName}

Hi ${firstName},

${data.changedByName} has updated your schedule at ${data.churchName} — ${
    data.action === "removed"
      ? `you have been removed from ${data.oldRole}`
      : `you have been moved from ${data.oldRole} to ${data.newRole}`
  } for ${data.serviceName} on ${dateStr}.

Service: ${data.serviceName}
Date: ${dateStr}
${data.action === "removed" ? `Role: ${data.oldRole}\nAction: Removed` : `Previous Role: ${data.oldRole}\nNew Role: ${data.newRole}`}

View My Schedule: https://volunteercal.com/dashboard/my-schedule

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
