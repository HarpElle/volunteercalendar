/**
 * Invite email — sent when a volunteer is invited to join a church on VolunteerCal.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  P,
  BOLD,
} from "./base-layout";

export interface InviteEmailData {
  inviteeName: string;
  churchName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

export function buildInviteEmail(data: InviteEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.inviteeName.split(" ")[0] || "there";

  const subject = `You've been invited to join ${data.churchName} on VolunteerCal`;

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                <strong ${BOLD}>${data.inviterName}</strong> has invited you to join <strong ${BOLD}>${data.churchName}</strong> on VolunteerCal as a <strong ${BOLD}>${data.role}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                VolunteerCal makes it simple to see when you're scheduled, confirm your availability, and stay in the loop — all in one place.
              </p>

              ${ctaButton(data.acceptUrl, "Accept Invitation")}

              ${mutedCenter("If you weren't expecting this invitation, you can safely ignore this email.")}`;

  const html = wrapInLayout({
    headerText: "You're Invited",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `You've Been Invited to ${data.churchName}

Hi ${firstName},

${data.inviterName} has invited you to join ${data.churchName} on VolunteerCal as a ${data.role}.

VolunteerCal makes it simple to see when you're scheduled, confirm your availability, and stay in the loop — all in one place.

Accept your invitation: ${data.acceptUrl}

If you weren't expecting this invitation, you can safely ignore this email.

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
