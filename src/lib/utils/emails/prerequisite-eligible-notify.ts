/** Email sent to schedulers when a volunteer completes all prerequisites and becomes eligible. */

import { wrapInLayout, P, ctaButton, onBehalfFooter, BOLD } from "./base-layout";

export interface EligibleNotifyEmailData {
  schedulerName: string;
  volunteerName: string;
  churchName: string;
  ministryName: string;
  dashboardUrl: string;
}

export function buildEligibleNotifyEmail(data: EligibleNotifyEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.schedulerName.split(" ")[0] || "there";

  const subject = `${data.volunteerName} is now eligible for ${data.ministryName}`;

  const body = `<p ${P}>
    Hi ${firstName},
  </p>
  <p ${P}>
    <strong ${BOLD}>${data.volunteerName}</strong> has completed all prerequisite steps for <strong ${BOLD}>${data.ministryName}</strong> and is now eligible to be scheduled.
  </p>
  <p ${P}>
    You can include them in your next schedule.
  </p>
  ${ctaButton(data.dashboardUrl, "View Scheduling Dashboard")}`;

  const html = wrapInLayout({
    headerText: "New Volunteer Ready",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `New Volunteer Ready \u2014 ${data.churchName}

Hi ${firstName},

${data.volunteerName} has completed all prerequisite steps for ${data.ministryName} and is now eligible to be scheduled.

View scheduling dashboard: ${data.dashboardUrl}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
