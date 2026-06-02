/**
 * Approval Reminder email — sent to ministry leads who haven't
 * approved their team's schedule as the deadline approaches.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  P,
  BOLD,
} from "./base-layout";
import { escapeHtml } from "./escape";

export interface ApprovalReminderEmailData {
  leaderName: string;
  churchName: string;
  ministryName: string;
  coveragePeriod: string;
  targetDate: string;
  reviewUrl: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildApprovalReminderEmail(data: ApprovalReminderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.leaderName.split(" ")[0] || "there";

  const subject = `Reminder: ${data.ministryName} schedule approval due ${data.targetDate}`;

  const body = `
              <p ${P}>
                Hi ${escapeHtml(firstName)},
              </p>
              <p ${P}>
                Just a friendly reminder — the <strong ${BOLD}>${escapeHtml(data.ministryName)}</strong> schedule for <strong ${BOLD}>${escapeHtml(data.coveragePeriod)}</strong> still needs your approval. The deadline is <strong ${BOLD}>${escapeHtml(data.targetDate)}</strong>.
              </p>
              <p ${P}>
                Once all team leads approve, the schedule can be published and volunteers notified.
              </p>

              ${ctaButton(data.reviewUrl, "Review & Approve")}

              ${mutedCenter("Other teams are waiting on your approval to finalize the schedule.")}`;

  const html = wrapInLayout({
    headerText: "Approval Reminder",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Approval Reminder — ${data.churchName}

Hi ${firstName},

Just a friendly reminder — the ${data.ministryName} schedule for ${data.coveragePeriod} still needs your approval. The deadline is ${data.targetDate}.

Once all team leads approve, the schedule can be published and volunteers notified.

Review & approve: ${data.reviewUrl}

Other teams are waiting on your approval to finalize the schedule.

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
