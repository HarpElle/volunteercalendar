/**
 * Org-deleted-members email — sent to members when their organization is deleted.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  P,
  P_LAST,
  BOLD,
} from "./base-layout";

export interface OrgDeletedMembersEmailData {
  userName: string;
  orgName: string;
  hasOtherOrgs: boolean;
}

export function buildOrgDeletedMembersEmail(data: OrgDeletedMembersEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `${data.orgName} has been deleted from VolunteerCal`;

  let followUpHtml: string;
  let followUpText: string;

  if (data.hasOtherOrgs) {
    followUpHtml = `You can still access your other organizations from your dashboard.`;
    followUpText = `You can still access your other organizations from your dashboard.`;
  } else {
    followUpHtml = `If you no longer need VolunteerCal, you can delete your account from Account Settings. Or create a new organization anytime.`;
    followUpText = `If you no longer need VolunteerCal, you can delete your account from Account Settings. Or create a new organization anytime.`;
  }

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                <strong ${BOLD}>${data.orgName}</strong> has been deleted by its administrator. Your membership and any associated data have been removed.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                ${followUpHtml}
              </p>

              ${ctaButton("https://volunteercal.org/dashboard", "Go to Dashboard")}

              ${mutedCenter("You're receiving this because you were a member of " + data.orgName + ".")}`;

  const html = wrapInLayout({
    headerText: "Organization Deleted",
    body,
  });

  const text = `Organization Deleted

Hi ${firstName},

${data.orgName} has been deleted by its administrator. Your membership and any associated data have been removed.

${followUpText}

Go to Dashboard: https://volunteercal.org/dashboard

--
VolunteerCal - Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
