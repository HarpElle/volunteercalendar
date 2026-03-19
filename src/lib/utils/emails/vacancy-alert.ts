/**
 * Vacancy-alert email — sent to schedulers when a volunteer departs
 * and leaves assignments that need to be filled.
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
  P_LAST,
  BOLD,
} from "./base-layout";

export interface VacancyAlertEmailData {
  schedulerName: string;
  departedName: string;
  churchName: string;
  vacancies: Array<{
    serviceName: string;
    serviceDate: string;
    roleName: string;
  }>;
}

export function buildVacancyAlertEmail(data: VacancyAlertEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.schedulerName.split(" ")[0] || "there";

  const subject = `Volunteer departure \u2014 assignments need attention at ${data.churchName}`;

  const vacancyRows = data.vacancies
    .map((v) =>
      detailRow(
        v.roleName,
        v.serviceName,
        formatDateLong(v.serviceDate),
      ),
    )
    .join("");

  const vacancyCard = detailCard(
    `<table width="100%" cellpadding="0" cellspacing="0">${vacancyRows}</table>`,
  );

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                <strong ${BOLD}>${data.departedName}</strong> is no longer part of <strong ${BOLD}>${data.churchName}</strong>. The following assignments previously held by ${data.departedName} now need to be filled:
              </p>

              ${vacancyCard}

              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Please review these openings and reassign them at your earliest convenience.
              </p>

              ${ctaButton("https://volunteercal.org/dashboard/schedules", "Review Schedules")}

              ${mutedCenter("You're receiving this because you manage schedules that were affected by this departure.")}`;

  const html = wrapInLayout({
    headerText: "Assignment Vacancy",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const vacancyList = data.vacancies
    .map(
      (v) =>
        `  - ${v.roleName}: ${v.serviceName} (${formatDateLong(v.serviceDate)})`,
    )
    .join("\n");

  const text = `Assignment Vacancy — ${data.churchName}

Hi ${firstName},

${data.departedName} is no longer part of ${data.churchName}. The following assignments now need to be filled:

${vacancyList}

Please review these openings and reassign them at your earliest convenience.

Review Schedules: https://volunteercal.org/dashboard/schedules

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
