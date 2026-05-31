/** Wave 9 P0-3 sub-PR D: email sent when a volunteer's raw
 *  `background_check.expires_at` is approaching or has passed.
 *
 *  Distinct from the journey-step expiry warning because the raw
 *  bg-check lives on `Person.background_check`, not in
 *  `volunteer_journey[]`. Volunteers in scope: any with
 *  `background_check.status === "cleared"` AND `expires_at` is set.
 *
 *  Two variants:
 *    - "approaching"  — within EXPIRY_WARNING_DAYS of expires_at
 *    - "expired"      — past expires_at; cron has auto-marked status
 */

import {
  wrapInLayout,
  P,
  detailCard,
  detailRow,
  ctaButton,
  onBehalfFooter,
  formatDateLong,
  BOLD,
} from "./base-layout";
import { escapeHtml } from "./escape";

export interface BackgroundCheckExpiryEmailData {
  volunteerName: string;
  churchName: string;
  expiresAt: string;
  daysRemaining: number;
  /** "approaching" — warning ahead of expiry; "expired" — cron just
   *  auto-marked status. */
  variant: "approaching" | "expired";
  dashboardUrl: string;
}

export function buildBackgroundCheckExpiryEmail(
  data: BackgroundCheckExpiryEmailData,
): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";
  const expired = data.variant === "expired";

  const subject = expired
    ? `Your background check at ${data.churchName} has expired`
    : `Background check renewal needed — expires in ${data.daysRemaining} days`;

  const headerText = expired ? "Background Check Expired" : "Renewal Needed";

  const bodyIntro = expired
    ? `Your <strong ${BOLD}>background check</strong> for ${escapeHtml(data.churchName)} expired on ${escapeHtml(formatDateLong(data.expiresAt))}. To stay eligible for scheduled assignments, please renew it as soon as possible.`
    : `Your <strong ${BOLD}>background check</strong> for ${escapeHtml(data.churchName)} expires on ${escapeHtml(formatDateLong(data.expiresAt))} — ${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"} from now. Please renew before then to maintain your eligibility to serve.`;

  const daysLabel = expired ? "Days Past Expiry" : "Days Remaining";
  const daysValue = expired ? Math.abs(data.daysRemaining) : data.daysRemaining;

  const body = `<p ${P}>
    Hi ${escapeHtml(firstName)},
  </p>
  <p ${P}>${bodyIntro}</p>
  ${detailCard(`<table width="100%" cellpadding="0" cellspacing="0">
    ${detailRow("Item", "Background check")}
    ${detailRow(expired ? "Expired On" : "Expires", formatDateLong(data.expiresAt))}
    <tr>
      <td>
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">${daysLabel}</span><br>
        <span style="font-size:15px;font-weight:600;color:#E07A5F;">${daysValue} day${daysValue === 1 ? "" : "s"}</span>
      </td>
    </tr>
  </table>`)}
  ${ctaButton(data.dashboardUrl, expired ? "Renew Now" : "View My Journey", "#E07A5F")}`;

  const html = wrapInLayout({
    headerText,
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = expired
    ? `${headerText} — ${data.churchName}

Hi ${firstName},

Your background check for ${data.churchName} expired on ${formatDateLong(data.expiresAt)} (${daysValue} day${daysValue === 1 ? "" : "s"} ago).

Please renew it as soon as possible to maintain eligibility for scheduled assignments.

Renew: ${data.dashboardUrl}

—
Sent by VolunteerCal on behalf of ${data.churchName}`
    : `${headerText} — ${data.churchName}

Hi ${firstName},

Your background check for ${data.churchName} expires on ${formatDateLong(data.expiresAt)} (${daysValue} day${daysValue === 1 ? "" : "s"} from now).

Please renew it to maintain your eligibility to serve.

View your journey: ${data.dashboardUrl}

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
