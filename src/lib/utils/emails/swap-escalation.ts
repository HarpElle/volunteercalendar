/**
 * Swap-escalation email (Wave 12 C).
 *
 * Sent by the daily cron to schedulers + admins for open
 * swap_requests where the service is today or tomorrow and no
 * teammate has covered. Tone: heads-up, not panic — the scheduler
 * still has time to reach out personally or reassign.
 *
 * Email is fire-once per swap (the cron stamps `escalated_at` so we
 * don't repeat). No CTA to a special admin UI yet; the link points
 * to the schedule so the scheduler can take normal manual action
 * (rebook, talk to the volunteer, etc.).
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

export interface SwapEscalationData {
  recipientName: string;
  /** Volunteer who originally asked for a sub. */
  requesterName: string;
  churchName: string;
  /** Team / ministry the role belongs to (user-facing label). */
  teamName: string;
  serviceName: string;
  /** ISO YYYY-MM-DD. */
  serviceDate: string;
  roleName: string;
  /** Optional note the requester left when opening the swap. */
  note: string | null;
  /** Absolute URL to deep-link the scheduler to the schedule. */
  ctaUrl: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildSwapEscalationEmail(
  data: SwapEscalationData,
): { subject: string; html: string; text: string } {
  const firstName = data.recipientName.split(" ")[0] || "there";
  const dateStr = formatDateLong(data.serviceDate);

  const subject = `Heads-up — no sub yet for ${data.roleName} on ${dateStr}`;

  const rows = [
    detailRow("Volunteer", data.requesterName),
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
                <strong ${BOLD}>${escapeHtml(data.requesterName)}</strong> asked the <strong ${BOLD}>${escapeHtml(data.teamName)}</strong> team for a sub, but no teammate has covered yet. The service is coming up &mdash; here&rsquo;s the heads-up so you can step in if needed.
              </p>

              ${card}
              ${noteBlock}

              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                You can still let teammates work it out, reach out to ${escapeHtml(data.requesterName)} directly, or reassign someone via the schedule. This is the only escalation email you&rsquo;ll get for this swap.
              </p>

              ${ctaButton(data.ctaUrl, "Open schedule")}

              ${mutedCenter("You're receiving this because you manage scheduling for this team.")}`;

  const html = wrapInLayout({
    headerText: "Open swap still uncovered",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Open swap still uncovered — ${data.churchName}

Hi ${firstName},

${data.requesterName} asked the ${data.teamName} team for a sub, but no teammate has covered yet. The service is coming up — here's the heads-up so you can step in if needed.

Volunteer: ${data.requesterName}
Team: ${data.teamName}
Service: ${data.serviceName}
Date: ${dateStr}
Role: ${data.roleName}
${data.note ? `\nNote from ${data.requesterName}: ${data.note}\n` : ""}
You can still let teammates work it out, reach out to ${data.requesterName} directly, or reassign someone via the schedule. This is the only escalation email you'll get for this swap.

Open schedule: ${data.ctaUrl}

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
