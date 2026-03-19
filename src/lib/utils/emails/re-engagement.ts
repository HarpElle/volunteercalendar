/** Re-engagement email — sent when a user hasn't logged in for a while. */

import { wrapInLayout, P, ctaButton } from "./base-layout";

export interface ReEngagementData {
  userName: string;
  churchName: string;
  daysSinceLastLogin: number;
}

export function buildReEngagementEmail(data: ReEngagementData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `${data.churchName}'s schedule is waiting for you`;

  const body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                It's been about ${data.daysSinceLastLogin} days since you last visited VolunteerCal. Your account and ${data.churchName}'s data are right where you left them.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                If you ran into something that didn't work the way you expected, we'd genuinely like to hear about it. Just reply to this email \u2014 it goes straight to a real person.
              </p>
              ${ctaButton("https://volunteercal.com/dashboard", "Back to Your Dashboard")}`;

  const html = wrapInLayout({
    headerText: "We Missed You",
    body,
    footerHtml: `Sent by <span style="color:#E87461;">VolunteerCal</span> \u00b7 Thoughtfully built by HarpElle`,
  });

  const text = `We Missed You

Hi ${firstName},

It's been about ${data.daysSinceLastLogin} days since you last visited VolunteerCal. Your account and ${data.churchName}'s data are right where you left them.

If you ran into something that didn't work the way you expected, we'd genuinely like to hear about it. Just reply to this email \u2014 it goes straight to a real person.

Back to your dashboard: https://volunteercal.com/dashboard

\u2014
VolunteerCal \u00b7 Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
