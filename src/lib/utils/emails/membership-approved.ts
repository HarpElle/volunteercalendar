/**
 * Membership approved email — sent when a volunteer's join request is approved.
 */

import {
  wrapInLayout,
  ctaButton,
  onBehalfFooter,
  P,
  BOLD,
} from "./base-layout";

export interface MembershipApprovedData {
  userName: string;
  churchName: string;
  dashboardUrl: string;
}

export function buildMembershipApprovedEmail(data: MembershipApprovedData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `You've been approved to join ${data.churchName}`;

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Great news — your request to join <strong ${BOLD}>${data.churchName}</strong> has been approved. You can now view your schedule, set your availability, and more.
              </p>
              ${ctaButton(data.dashboardUrl, "Go to Dashboard")}`;

  const html = wrapInLayout({
    headerText: "You're In!",
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `You've Been Approved — ${data.churchName}

Hi ${firstName},

Great news — your request to join ${data.churchName} has been approved. You can now view your schedule, set your availability, and more.

Go to your dashboard: ${data.dashboardUrl}

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
