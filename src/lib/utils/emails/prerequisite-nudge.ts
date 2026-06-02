/** Gentle nudge email for volunteers with stalled onboarding progress. */

import { wrapInLayout, P, ctaButton, onBehalfFooter, BOLD } from "./base-layout";
import { escapeHtml } from "./escape";

export interface PrerequisiteNudgeEmailData {
  volunteerName: string;
  churchName: string;
  ministryName: string;
  stepsRemaining: number;
  totalSteps: number;
  dashboardUrl: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildPrerequisiteNudgeEmail(data: PrerequisiteNudgeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";
  const completed = data.totalSteps - data.stepsRemaining;

  const subject = `Continue your onboarding \u2014 ${data.stepsRemaining} step${data.stepsRemaining === 1 ? "" : "s"} left`;

  const progressPct = Math.round((completed / data.totalSteps) * 100);

  const progressBar = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:#E8E4DE;border-radius:8px;height:8px;">
      <div style="width:${progressPct}%;background-color:#81B29A;border-radius:8px;height:8px;"></div>
    </td>
  </tr>
  <tr>
    <td style="padding-top:6px;font-size:12px;color:#9A9BB5;text-align:center;">
      ${completed} of ${data.totalSteps} steps complete
    </td>
  </tr>
</table>`;

  const body = `<p ${P}>
    Hi ${escapeHtml(firstName)},
  </p>
  <p ${P}>
    You're making progress on your onboarding for <strong ${BOLD}>${escapeHtml(data.ministryName)}</strong> at ${escapeHtml(data.churchName)}! You have ${data.stepsRemaining} step${data.stepsRemaining === 1 ? "" : "s"} remaining.
  </p>
  ${progressBar}
  <p ${P}>
    Check in on your journey page to see what's next and keep moving forward.
  </p>
  ${ctaButton(data.dashboardUrl, "Continue My Journey", "#81B29A")}`;

  const html = wrapInLayout({
    headerText: "Keep Going!",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Keep Going! \u2014 ${data.churchName}

Hi ${firstName},

You're making progress on your onboarding for ${data.ministryName} at ${data.churchName}! You have ${data.stepsRemaining} step${data.stepsRemaining === 1 ? "" : "s"} remaining (${completed} of ${data.totalSteps} done).

Check your journey page to see what's next.

Continue your journey: ${data.dashboardUrl}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
