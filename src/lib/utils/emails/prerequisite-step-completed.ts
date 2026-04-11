/** Email sent when a volunteer completes an onboarding prerequisite step. */

import { wrapInLayout, P, ctaButton, onBehalfFooter, BOLD } from "./base-layout";

export interface StepCompletedEmailData {
  volunteerName: string;
  churchName: string;
  stepLabel: string;
  ministryName: string;
  completedCount: number;
  totalCount: number;
  dashboardUrl: string;
}

export function buildStepCompletedEmail(data: StepCompletedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";
  const remaining = data.totalCount - data.completedCount;
  const allDone = remaining === 0;

  const subject = allDone
    ? `All steps completed \u2014 ${data.ministryName}`
    : `Step completed \u2014 ${data.completedCount} of ${data.totalCount} done`;

  const progressPct = Math.round((data.completedCount / data.totalCount) * 100);

  const progressBar = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:#E8E4DE;border-radius:8px;height:8px;">
      <div style="width:${progressPct}%;background-color:#81B29A;border-radius:8px;height:8px;"></div>
    </td>
  </tr>
  <tr>
    <td style="padding-top:6px;font-size:12px;color:#9A9BB5;text-align:center;">
      ${data.completedCount} of ${data.totalCount} steps complete
    </td>
  </tr>
</table>`;

  const body = `<p ${P}>
    Hi ${firstName},
  </p>
  <p ${P}>
    Great news \u2014 you've completed <strong ${BOLD}>${data.stepLabel}</strong> for ${data.ministryName} at ${data.churchName}.
  </p>
  ${progressBar}
  <p ${P}>
    ${allDone ? "You've finished all the prerequisites! You're now eligible to serve." : `Just ${remaining} more step${remaining === 1 ? "" : "s"} to go. Keep it up!`}
  </p>
  ${ctaButton(data.dashboardUrl, "View My Journey", "#81B29A")}`;

  const html = wrapInLayout({
    headerText: allDone ? "All Steps Complete!" : "Step Completed!",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `${allDone ? "All Steps Complete!" : "Step Completed!"} \u2014 ${data.churchName}

Hi ${firstName},

You've completed "${data.stepLabel}" for ${data.ministryName} at ${data.churchName}.

Progress: ${data.completedCount} of ${data.totalCount} steps complete.

${allDone ? "You've finished all the prerequisites! You're now eligible to serve." : `Just ${remaining} more step${remaining === 1 ? "" : "s"} to go.`}

View your journey: ${data.dashboardUrl}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
