/** Free-tier upsell email — sent when usage approaches plan limits. */

import { wrapInLayout, P, BOLD, detailCard, ctaButton } from "./base-layout";

export interface UpsellData {
  userName: string;
  churchName: string;
  volunteerCount: number;
  volunteerLimit: number;
  ministryCount: number;
  ministryLimit: number;
}

function featureList(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:10px;font-size:14px;color:#4A4A6A;">
                          &#10003; More volunteers (up to 500)
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:10px;font-size:14px;color:#4A4A6A;">
                          &#10003; Multiple ministries (up to unlimited)
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:10px;font-size:14px;color:#4A4A6A;">
                          &#10003; SMS reminders
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4A4A6A;">
                          &#10003; Analytics &amp; advanced scheduling
                        </td>
                      </tr>
                    </table>`;
}

export function buildUpsellEmail(data: UpsellData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";
  const volPercent = Math.round((data.volunteerCount / data.volunteerLimit) * 100);
  const nearLimit = volPercent >= 80;

  const subject = nearLimit
    ? `${data.churchName} is approaching its volunteer limit`
    : `Unlock more for ${data.churchName}`;

  const body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                ${nearLimit
                  ? `${data.churchName} now has <strong ${BOLD}>${data.volunteerCount} of ${data.volunteerLimit}</strong> volunteers on the Free plan. Once you hit the limit, you won't be able to add more until you upgrade.`
                  : `${data.churchName} is making great use of VolunteerCal with ${data.volunteerCount} volunteers and ${data.ministryCount} ${data.ministryCount === 1 ? "ministry" : "ministries"}. Here's what you could unlock with a paid plan:`}
              </p>

              ${detailCard(featureList())}

              <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding-bottom:12px;">
      <a href="https://volunteercal.com/dashboard/billing" style="display:inline-block;background-color:#E87461;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
        See Plans &amp; Pricing
      </a>
    </td>
  </tr>
</table>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#9A9BB5;text-align:center;">
                All paid plans include a 14-day free trial. No commitment.
              </p>`;

  const html = wrapInLayout({
    headerText: nearLimit ? "You're Getting Close" : "Room to Grow",
    body,
    footerHtml: `Sent by <span style="color:#2D2B55;">Volunteer</span><span style="color:#E87461;">Cal</span> \u00b7 Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>`,
  });

  const text = `${subject}

Hi ${firstName},

${nearLimit
    ? `${data.churchName} now has ${data.volunteerCount} of ${data.volunteerLimit} volunteers on the Free plan. Once you hit the limit, you won't be able to add more until you upgrade.`
    : `${data.churchName} is making great use of VolunteerCal with ${data.volunteerCount} volunteers and ${data.ministryCount} ${data.ministryCount === 1 ? "ministry" : "ministries"}. Here's what you could unlock with a paid plan:`}

What you get:
- More volunteers (up to 500)
- Multiple ministries (up to unlimited)
- SMS reminders
- Analytics & advanced scheduling

See plans: https://volunteercal.com/dashboard/billing

All paid plans include a 14-day free trial. No commitment.

\u2014
VolunteerCal \u00b7 Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
