/**
 * Approval Request email — sent to ministry leads when a schedule
 * enters review and needs their team-level approval.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  P,
  BOLD,
} from "./base-layout";

export interface ApprovalRequestEmailData {
  leaderName: string;
  churchName: string;
  ministryName: string;
  coveragePeriod: string;
  targetDate: string | null;
  reviewUrl: string;
}

export function buildApprovalRequestEmail(data: ApprovalRequestEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.leaderName.split(" ")[0] || "there";

  const subject = `Review needed: ${data.ministryName} schedule for ${data.coveragePeriod}`;

  const deadlineNote = data.targetDate
    ? `<p ${P}>Please complete your review by <strong ${BOLD}>${data.targetDate}</strong>.</p>`
    : "";

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                A new schedule for <strong ${BOLD}>${data.coveragePeriod}</strong> is ready for your review. As the <strong ${BOLD}>${data.ministryName}</strong> team lead, please review the assignments for your team and approve or request changes.
              </p>
              ${deadlineNote}
              <p ${P}>
                You can swap, add, or remove volunteers from your team's assignments. When you're satisfied, mark your team as approved.
              </p>

              ${ctaButton(data.reviewUrl, "Review My Team's Schedule")}

              ${mutedCenter("All team leads must approve before the schedule can be published.")}`;

  const html = wrapInLayout({
    headerText: "Schedule Review",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Schedule Review Needed — ${data.churchName}

Hi ${firstName},

A new schedule for ${data.coveragePeriod} is ready for your review. As the ${data.ministryName} team lead, please review the assignments for your team and approve or request changes.

${data.targetDate ? `Please complete your review by ${data.targetDate}.\n\n` : ""}You can swap, add, or remove volunteers from your team's assignments. When you're satisfied, mark your team as approved.

Review your team's schedule: ${data.reviewUrl}

All team leads must approve before the schedule can be published.

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
