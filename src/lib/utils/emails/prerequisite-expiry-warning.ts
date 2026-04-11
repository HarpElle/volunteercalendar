/** Email sent when a completed prerequisite step is approaching its expiry date. */

import {
  wrapInLayout,
  P,
  detailCard,
  detailRow,
  ctaButton,
  onBehalfFooter,
  formatDateLong,
  BOLD,
} from "./base-layout";

export interface ExpiryWarningEmailData {
  volunteerName: string;
  churchName: string;
  stepLabel: string;
  ministryName: string;
  expiresAt: string;
  daysRemaining: number;
  dashboardUrl: string;
}

export function buildExpiryWarningEmail(data: ExpiryWarningEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";

  const subject = `Action needed \u2014 your ${data.stepLabel} expires in ${data.daysRemaining} days`;

  const body = `<p ${P}>
    Hi ${firstName},
  </p>
  <p ${P}>
    Your <strong ${BOLD}>${data.stepLabel}</strong> for ${data.ministryName} at ${data.churchName} is expiring soon. Please renew it to maintain your eligibility to serve.
  </p>
  ${detailCard(`<table width="100%" cellpadding="0" cellspacing="0">
    ${detailRow("Requirement", data.stepLabel)}
    ${detailRow("Ministry", data.ministryName)}
    ${detailRow("Expires", formatDateLong(data.expiresAt))}
    <tr>
      <td>
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Days Remaining</span><br>
        <span style="font-size:15px;font-weight:600;color:#E07A5F;">${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"}</span>
      </td>
    </tr>
  </table>`)}
  ${ctaButton(data.dashboardUrl, "View My Journey", "#E07A5F")}`;

  const html = wrapInLayout({
    headerText: "Renewal Needed",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Renewal Needed \u2014 ${data.churchName}

Hi ${firstName},

Your "${data.stepLabel}" for ${data.ministryName} at ${data.churchName} expires on ${formatDateLong(data.expiresAt)} (${data.daysRemaining} days from now).

Please renew it to maintain your eligibility to serve.

View your journey: ${data.dashboardUrl}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
