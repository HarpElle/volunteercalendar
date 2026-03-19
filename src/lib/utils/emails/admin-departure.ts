/**
 * Admin-departure email — sent to admins when a member leaves an organization.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  P,
  P_LAST,
  BOLD,
} from "./base-layout";

export interface AdminDepartureEmailData {
  adminName: string;
  departedName: string;
  departedRole: string;
  churchName: string;
  teamsAffected: string[];
  schedulersNotified: number;
}

export function buildAdminDepartureEmail(data: AdminDepartureEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.adminName.split(" ")[0] || "there";

  const subject = `Member departure \u2014 ${data.departedName} has left ${data.churchName}`;

  const teamsList = data.teamsAffected.length > 0
    ? data.teamsAffected.join(", ")
    : "none";

  const schedulerNote =
    data.schedulersNotified > 0
      ? `${data.schedulersNotified} scheduler${data.schedulersNotified === 1 ? " has" : "s have"} been notified of any assignment vacancies that resulted from this departure.`
      : "No schedulers were affected by this departure.";

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                <strong ${BOLD}>${data.departedName}</strong> (${data.departedRole}) has left <strong ${BOLD}>${data.churchName}</strong>.
              </p>
              <p ${P}>
                <strong ${BOLD}>Teams affected:</strong> ${teamsList}.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                ${schedulerNote}
              </p>

              ${ctaButton("https://volunteercal.org/dashboard/people", "View People")}

              ${mutedCenter("You're receiving this because you're an administrator of " + data.churchName + ".")}`;

  const html = wrapInLayout({
    headerText: "Member Departure",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Member Departure — ${data.churchName}

Hi ${firstName},

${data.departedName} (${data.departedRole}) has left ${data.churchName}.

Teams affected: ${teamsList}.

${schedulerNote}

View People: https://volunteercal.org/dashboard/people

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
