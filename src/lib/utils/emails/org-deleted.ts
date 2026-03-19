/**
 * Organization deleted email — confirmation sent after an org is permanently removed.
 */

import {
  wrapInLayout,
  ctaButton,
  P,
  BOLD,
} from "./base-layout";

export interface OrgDeletedEmailData {
  userName: string;
  orgName: string;
}

export function buildOrgDeletedEmail(data: OrgDeletedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `Your organization "${data.orgName}" has been deleted`;

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                This is a confirmation that your organization <strong ${BOLD}>${data.orgName}</strong> and all of its associated data — including volunteers, schedules, memberships, and billing — have been permanently deleted from VolunteerCal.
              </p>
              <p ${P}>
                Thank you for giving VolunteerCal a place in your workflow. We genuinely appreciate the time you spent with us, and we hope we made scheduling a little easier along the way.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                If your team ever needs a hand with volunteer coordination again, we'd love to welcome you back. Your account is still active — you can create a new organization anytime from your dashboard.
              </p>

              ${ctaButton("https://volunteercal.org/dashboard", "Go to Dashboard")}

              <p style="margin:0;font-size:13px;line-height:1.6;color:#9A9BB5;text-align:center;">
                If you'd also like to delete your account entirely, you can do so from Account Settings.
              </p>`;

  const html = wrapInLayout({
    headerText: "Organization Deleted",
    body,
  });

  const text = `Organization Deleted — ${data.orgName}

Hi ${firstName},

This is a confirmation that your organization "${data.orgName}" and all of its associated data — including volunteers, schedules, memberships, and billing — have been permanently deleted from VolunteerCal.

Thank you for giving VolunteerCal a place in your workflow. We genuinely appreciate the time you spent with us, and we hope we made scheduling a little easier along the way.

If your team ever needs a hand with volunteer coordination again, we'd love to welcome you back. Your account is still active — you can create a new organization anytime from your dashboard.

Go to your dashboard: https://volunteercal.org/dashboard

If you'd also like to delete your account entirely, you can do so from Account Settings.

—
VolunteerCal · Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
