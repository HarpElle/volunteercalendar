/** Purchase thank-you email — sent after a plan upgrade. */

import { wrapInLayout, P, BOLD, ctaButton } from "./base-layout";

export interface PurchaseThankYouData {
  userName: string;
  planName: string;
  churchName: string;
}

export function buildPurchaseThankYouEmail(data: PurchaseThankYouData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `Thanks for upgrading to ${data.planName}`;

  const body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                Thanks for upgrading ${data.churchName} to the <strong ${BOLD}>${data.planName}</strong> plan. Your new features are already active \u2014 no setup needed.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                If you ever have questions about your plan or need help with anything, just reply to this email. We're here.
              </p>
              ${ctaButton("https://volunteercal.com/dashboard/billing", "View Your Plan")}`;

  const html = wrapInLayout({
    headerText: "You're All Set",
    headerSubtitle: `${data.planName} Plan`,
    body,
    footerHtml: `Sent by <span style="color:#2D3047;">Volunteer</span><span style="color:#E07A5F;">Cal</span> \u00b7 Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>`,
  });

  const text = `Thanks for Upgrading \u2014 ${data.planName} Plan

Hi ${firstName},

Thanks for upgrading ${data.churchName} to the ${data.planName} plan. Your new features are already active \u2014 no setup needed.

If you ever have questions about your plan or need help, just reply to this email.

View your plan: https://volunteercal.com/dashboard/billing

\u2014
VolunteerCal \u00b7 Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
