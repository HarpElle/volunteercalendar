/** Welcome email — sent when a new user creates an account. */

import { wrapInLayout, P, ctaButton, P_LAST } from "./base-layout";

export interface WelcomeEmailData {
  userName: string;
}

export interface AccountCreatedEmailData {
  userName: string;
}

function stepBubble(num: number): string {
  return `<span style="display:inline-block;width:24px;height:24px;border-radius:50%;background-color:#2D3047;color:#ffffff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;">${num}</span>`;
}

function stepRow(num: number, title: string, desc: string, isLast = false): string {
  return `<tr>
                        <td${isLast ? "" : ` style="padding-bottom:14px;"`}>
                          ${stepBubble(num)}
                          <span style="font-size:14px;font-weight:600;color:#2D3047;">${title}</span><br>
                          <span style="font-size:13px;color:#4A4A6A;margin-left:34px;display:inline-block;">${desc}</span>
                        </td>
                      </tr>`;
}

export function buildWelcomeEmail(data: WelcomeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = "Welcome to VolunteerCal \u2014 let's get your team set up";

  const body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                Thanks for creating your account. VolunteerCal was built to take the guesswork out of volunteer scheduling \u2014 so you can spend less time juggling spreadsheets and more time with your team.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Here's how to get started:
              </p>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${stepRow(1, "Set up your organization", "Name, timezone, and scheduling preferences.")}
                      ${stepRow(2, "Add a team or ministry", "Create your first team and assign it a color.")}
                      ${stepRow(3, "Add your volunteers", "Import from CSV or add them one at a time.")}
                      ${stepRow(4, "Generate your first schedule", "Pick a date range and let the scheduler do the rest.", true)}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              ${ctaButton("https://volunteercal.com/dashboard", "Go to Your Dashboard")}

              <p style="margin:0;font-size:14px;line-height:1.6;color:#4A4A6A;">
                If you have any questions or run into anything, just reply to this email \u2014 we're happy to help.
              </p>`;

  const html = wrapInLayout({
    headerText: 'Welcome to Volunteer<span style="color:#E07A5F;">Cal</span>',
    body,
    footerHtml: `Sent by <span style="color:#2D3047;">Volunteer</span><span style="color:#E07A5F;">Cal</span> \u00b7 Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>`,
  });

  const text = `Welcome to VolunteerCal

Hi ${firstName},

Thanks for creating your account. VolunteerCal was built to take the guesswork out of volunteer scheduling \u2014 so you can spend less time juggling spreadsheets and more time with your team.

Here's how to get started:

1. Set up your organization \u2014 name, timezone, and scheduling preferences.
2. Add a team or ministry \u2014 create your first team and assign it a color.
3. Add your volunteers \u2014 import from CSV or add them one at a time.
4. Generate your first schedule \u2014 pick a date range and let the scheduler do the rest.

Go to your dashboard: https://volunteercal.com/dashboard

If you have any questions, just reply to this email \u2014 we're happy to help.

\u2014
VolunteerCal \u00b7 Thoughtfully built by HarpElle`;

  return { subject, html, text };
}

/**
 * Lightweight account confirmation — sent when a user registers via a join link.
 * The full welcome messaging comes from the welcome-to-org email after they join.
 */
export function buildAccountCreatedEmail(data: AccountCreatedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = "Your VolunteerCal account is ready";

  const body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                Your VolunteerCal account has been created. You can now view your schedule, set your availability, and stay connected with your team.
              </p>
              <p ${P_LAST}>
                Once you join an organization, you'll be able to see your assignments, manage blockout dates, and confirm or decline when you're scheduled to serve.
              </p>

              ${ctaButton("https://volunteercal.com/dashboard", "Go to Your Dashboard")}`;

  const html = wrapInLayout({
    headerText: 'Welcome to Volunteer<span style="color:#E07A5F;">Cal</span>',
    body,
    footerHtml: `Sent by <span style="color:#2D3047;">Volunteer</span><span style="color:#E07A5F;">Cal</span> \u00b7 Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>`,
  });

  const text = `Your VolunteerCal account is ready

Hi ${firstName},

Your VolunteerCal account has been created. You can now view your schedule, set your availability, and stay connected with your team.

Once you join an organization, you'll be able to see your assignments, manage blockout dates, and confirm or decline when you're scheduled to serve.

Go to your dashboard: https://volunteercal.com/dashboard

\u2014
VolunteerCal \u00b7 Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
