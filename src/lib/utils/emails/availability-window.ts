/**
 * Availability Window email — sent to all active volunteers when an admin
 * initiates a schedule period and requests availability updates.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  P,
  BOLD,
} from "./base-layout";
import { escapeHtml } from "./escape";

export interface AvailabilityWindowEmailData {
  volunteerName: string;
  churchName: string;
  coveragePeriod: string;
  dueDate: string;
  message: string | null;
  availabilityUrl: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildAvailabilityWindowEmail(data: AvailabilityWindowEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";

  const subject = `Update your availability for ${data.coveragePeriod} — ${data.churchName}`;

  const customMessage = data.message
    ? `<p ${P}>${escapeHtml(data.message)}</p>`
    : "";

  const body = `
              <p ${P}>
                Hi ${escapeHtml(firstName)},
              </p>
              <p ${P}>
                Help us plan ahead! Please update your availability for <strong ${BOLD}>${escapeHtml(data.coveragePeriod)}</strong> by <strong ${BOLD}>${escapeHtml(data.dueDate)}</strong> so we can create a fair, balanced schedule.
              </p>
              ${customMessage}

              ${ctaButton(data.availabilityUrl, "Update My Availability")}

              ${mutedCenter("The sooner you update, the better we can plan. Thank you for serving!")}`;

  const html = wrapInLayout({
    headerText: "Availability Needed",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Update Your Availability — ${data.churchName}

Hi ${firstName},

Help us plan ahead! Please update your availability for ${data.coveragePeriod} by ${data.dueDate} so we can create a fair, balanced schedule.

${data.message ? data.message + "\n\n" : ""}Update your availability: ${data.availabilityUrl}

The sooner you update, the better we can plan. Thank you for serving!

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
