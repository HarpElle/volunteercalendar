/** Org created email — sent when a user creates a new organization. */

import { wrapInLayout, P, ctaButton } from "./base-layout";

export interface OrgCreatedEmailData {
  userName: string;
  orgName: string;
  orgType: "church" | "nonprofit" | "other";
}

function checkItem(text: string): string {
  return `<tr>
            <td style="padding-bottom:10px;font-size:14px;line-height:1.5;color:#4A4A6A;">
              <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background-color:#7BA889;color:#ffffff;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:10px;">&#10003;</span>
              ${text}
            </td>
          </tr>`;
}

function nextStep(num: number, title: string, desc: string): string {
  return `<tr>
            <td style="padding-bottom:12px;font-size:14px;line-height:1.5;color:#4A4A6A;">
              <span style="display:inline-block;width:22px;height:22px;border-radius:6px;background-color:#2D2B55;color:#ffffff;text-align:center;line-height:22px;font-size:11px;font-weight:700;margin-right:10px;">${num}</span>
              <strong style="color:#2D2B55;">${title}</strong><br>
              <span style="margin-left:32px;display:inline-block;font-size:13px;color:#9A9BB5;">${desc}</span>
            </td>
          </tr>`;
}

export function buildOrgCreatedEmail(data: OrgCreatedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";
  const teamWord = data.orgType === "church" ? "ministries" : "teams";

  const subject = `${data.orgName} is live on VolunteerCal`;

  const body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                Great news \u2014 <strong>${data.orgName}</strong> is all set up on VolunteerCal! You're the owner, which means you have full control over scheduling, ${teamWord}, and members.
              </p>

              <!-- What's done -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F7F2;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#2D2B55;text-transform:uppercase;letter-spacing:0.5px;">Done</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${checkItem("Account created")}
                      ${checkItem(`${data.orgName} organization set up`)}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Next steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#2D2B55;text-transform:uppercase;letter-spacing:0.5px;">Next steps</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${nextStep(1, `Create your first ${teamWord === "ministries" ? "ministry" : "team"}`, `Organize volunteers into ${teamWord} with color-coded labels.`)}
                      ${nextStep(2, "Add your volunteers", "Import from a CSV, paste from your ChMS, or add them one by one.")}
                      ${nextStep(3, "Set up a service or event", "Define recurring services with roles, or create one-time events.")}
                      ${nextStep(4, "Generate a schedule", "Pick a date range and let the algorithm draft a fair rotation.")}
                    </table>
                  </td>
                </tr>
              </table>

              ${ctaButton("https://volunteercal.com/dashboard", "Open Your Dashboard")}

              <p style="margin:0;font-size:13px;line-height:1.6;color:#9A9BB5;">
                You're on the <strong>Free plan</strong> \u2014 perfect for getting started. When you're ready for more ${teamWord}, short links, and advanced features, you can upgrade anytime from your dashboard.
              </p>`;

  const html = wrapInLayout({
    headerText: "You're All Set!",
    headerSubtitle: `${data.orgName} is ready to go`,
    body,
    footerHtml: `Sent by <span style="color:#2D2B55;">Volunteer</span><span style="color:#E87461;">Cal</span> \u00b7 Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>`,
  });

  const text = `${data.orgName} is live on VolunteerCal

Hi ${firstName},

Great news \u2014 ${data.orgName} is all set up on VolunteerCal! You're the owner, which means you have full control over scheduling, ${teamWord}, and members.

Done:
\u2713 Account created
\u2713 ${data.orgName} organization set up

Next steps:
1. Create your first ${teamWord === "ministries" ? "ministry" : "team"} \u2014 organize volunteers into ${teamWord} with color-coded labels.
2. Add your volunteers \u2014 import from a CSV, paste from your ChMS, or add them one by one.
3. Set up a service or event \u2014 define recurring services with roles, or create one-time events.
4. Generate a schedule \u2014 pick a date range and let the algorithm draft a fair rotation.

Open your dashboard: https://volunteercal.com/dashboard

You're on the Free plan \u2014 perfect for getting started. Upgrade anytime from your dashboard.

\u2014
VolunteerCal \u00b7 Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
