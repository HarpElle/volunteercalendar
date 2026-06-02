/**
 * Swap-request broadcast email (Wave 12 A).
 *
 * Sent to every teammate in a ministry when one of their teammates
 * opens a "Need a sub" request. The email goes out IN PARALLEL with
 * the in-app `swap_request` notification — schedulers reported that
 * volunteers don't log in often enough to discover an in-app
 * notification on its own, so email is the primary discovery channel.
 *
 * Tone: peer-to-peer ask, not a scheduler escalation. CTA links
 * straight to the open-swaps section on the recipient's schedule so
 * a single tap takes them to the "Cover this" button.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  detailCard,
  detailRow,
  formatDateLong,
  P,
  BOLD,
} from "./base-layout";
import { escapeHtml } from "./escape";

export interface SwapRequestBroadcastData {
  /** Display name of the teammate receiving this email. */
  recipientName: string;
  /** Display name of the volunteer who needs a sub. */
  requesterName: string;
  /** The Team (a.k.a. ministry) the role belongs to — user-facing label. */
  teamName: string;
  churchName: string;
  /** Service or event name, e.g. "Sunday Morning" — falls back to "service". */
  serviceName: string;
  /** ISO date "YYYY-MM-DD" — rendered as long-form. */
  serviceDate: string;
  roleName: string;
  /** Optional note the requester left for the team. */
  note: string | null;
  /** Absolute URL to deep-link the recipient to the open-swaps section. */
  ctaUrl: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildSwapRequestBroadcastEmail(
  data: SwapRequestBroadcastData,
): { subject: string; html: string; text: string } {
  const firstName = data.recipientName.split(" ")[0] || "there";
  const dateStr = formatDateLong(data.serviceDate);

  const subject = `Sub needed — ${data.roleName} on ${dateStr}`;

  const rows = [
    detailRow("Team", data.teamName),
    detailRow("Service", data.serviceName),
    detailRow("Date", dateStr),
    detailRow("Role", data.roleName),
  ].join("");

  const card = detailCard(
    `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
  );

  const noteBlock = data.note
    ? `<div style="margin:16px 0;padding:12px 16px;background:#FBF7F0;border-left:3px solid #D4A574;border-radius:4px;font-size:14px;color:#4A4A6A;line-height:1.6;">
        <strong ${BOLD}>Note from ${escapeHtml(data.requesterName)}:</strong><br/>
        ${escapeHtml(data.note).replace(/\n/g, "<br/>")}
      </div>`
    : "";

  const body = `
              <p ${P}>
                Hi ${escapeHtml(firstName)},
              </p>
              <p ${P}>
                <strong ${BOLD}>${escapeHtml(data.requesterName)}</strong> on the <strong ${BOLD}>${escapeHtml(data.teamName)}</strong> team needs someone to cover their shift. If you&rsquo;re free, you can claim it directly &mdash; no scheduler back-and-forth needed.
              </p>

              ${card}
              ${noteBlock}

              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                First teammate to tap <strong ${BOLD}>Cover this</strong> takes the spot. ${escapeHtml(data.requesterName)} and your scheduler will both be notified once someone steps in.
              </p>

              ${ctaButton(data.ctaUrl, "Cover this shift")}

              ${mutedCenter("You're receiving this because you're on the same team as the volunteer who needs a sub.")}`;

  const html = wrapInLayout({
    headerText: "A teammate needs a sub",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `A teammate needs a sub — ${data.churchName}

Hi ${firstName},

${data.requesterName} on the ${data.teamName} team needs someone to cover their shift. If you're free, you can claim it directly — no scheduler back-and-forth needed.

Team: ${data.teamName}
Service: ${data.serviceName}
Date: ${dateStr}
Role: ${data.roleName}
${data.note ? `\nNote from ${data.requesterName}: ${data.note}\n` : ""}
First teammate to tap "Cover this" takes the spot. ${data.requesterName} and your scheduler will both be notified once someone steps in.

Cover this shift: ${data.ctaUrl}

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
