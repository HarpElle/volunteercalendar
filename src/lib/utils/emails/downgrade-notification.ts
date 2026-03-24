/** Plan change notification email — sent when a subscription is downgraded or cancelled. */

import { wrapInLayout, P, BOLD, ctaButton, detailCard } from "./base-layout";
import type { OverLimitItem } from "@/lib/utils/tier-enforcement";

export interface DowngradeNotificationData {
  userName: string;
  churchName: string;
  oldPlanName: string;
  newPlanName: string;
  lostFeatures: string[];
  overLimitItems: OverLimitItem[];
}

export function buildDowngradeNotificationEmail(
  data: DowngradeNotificationData,
): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `Your ${data.churchName} plan has been updated to ${data.newPlanName}`;

  let body = `<p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                Your <strong ${BOLD}>${data.churchName}</strong> account has moved from the <strong ${BOLD}>${data.oldPlanName}</strong> plan to the <strong ${BOLD}>${data.newPlanName}</strong> plan. Here's what that means for your account.
              </p>`;

  // Lost features section
  if (data.lostFeatures.length > 0) {
    const featureRows = data.lostFeatures
      .map(
        (f) =>
          `<tr><td style="padding:4px 0 4px 12px;font-size:14px;color:#4A4A6A;">&bull; ${f}</td></tr>`,
      )
      .join("");

    body += detailCard(
      `<p style="margin:0 0 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Features no longer included</p>
       <table width="100%" cellpadding="0" cellspacing="0">${featureRows}</table>`,
    );
  }

  // Over-limit items section
  if (data.overLimitItems.length > 0) {
    const limitRows = data.overLimitItems
      .map(
        (item) =>
          `<tr><td style="padding:4px 0 4px 12px;font-size:14px;color:#4A4A6A;">&bull; You have ${item.current} ${item.resource} (${data.newPlanName} allows ${item.newLimit})</td></tr>`,
      )
      .join("");

    body += detailCard(
      `<p style="margin:0 0 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Usage above plan limits</p>
       <table width="100%" cellpadding="0" cellspacing="0">${limitRows}</table>
       <p style="margin:12px 0 0;font-size:13px;color:#9A9BB5;">Your existing data is preserved. You won't be able to add new items above the limit until you reduce usage or upgrade.</p>`,
    );
  }

  body += `<p ${P}>
             If you have any questions or this change was unexpected, just reply to this email. We're happy to help.
           </p>
           ${ctaButton("https://volunteercal.com/dashboard/billing", "View Your Plan")}`;

  const html = wrapInLayout({
    headerText: "Your Plan Has Changed",
    headerSubtitle: `${data.newPlanName} Plan`,
    body,
    footerHtml: `Sent by <span style="color:#2D2B55;">Volunteer</span><span style="color:#E87461;">Cal</span> &middot; Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>`,
  });

  // Plain text version
  const lostText =
    data.lostFeatures.length > 0
      ? `\nFeatures no longer included:\n${data.lostFeatures.map((f) => `  - ${f}`).join("\n")}\n`
      : "";

  const overText =
    data.overLimitItems.length > 0
      ? `\nUsage above plan limits:\n${data.overLimitItems.map((item) => `  - You have ${item.current} ${item.resource} (${data.newPlanName} allows ${item.newLimit})`).join("\n")}\nYour existing data is preserved. You won't be able to add new items above the limit until you reduce usage or upgrade.\n`
      : "";

  const text = `Your Plan Has Changed — ${data.newPlanName} Plan

Hi ${firstName},

Your ${data.churchName} account has moved from the ${data.oldPlanName} plan to the ${data.newPlanName} plan. Here's what that means for your account.
${lostText}${overText}
If you have any questions or this change was unexpected, just reply to this email.

View your plan: https://volunteercal.com/dashboard/billing

—
VolunteerCal · Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
