/**
 * Event signup confirmation — sent after someone (logged-in or guest) successfully
 * signs up to volunteer at an event via the public signup page.
 *
 * Codex QA 2026-05-15: previously the signup completed silently with no
 * confirmation email, so volunteers had no record of what they signed up for.
 * See plan i-want-you-to-iterative-spring.md Layer 8.
 *
 * Models the styling after event-invite.ts (DM Sans / DM Serif fonts, logo
 * outside the card). Self-contained HTML — does NOT use wrapInLayout.
 */

import { escapeHtml } from "./escape";

export interface EventSignupConfirmationData {
  recipientName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  roleTitle: string;
  churchName: string;
  /** Public detail page for the event, so the volunteer can view full info / cancel if needed. */
  eventUrl: string;
}

export function buildEventSignupConfirmationEmail(
  data: EventSignupConfirmationData,
) {
  const firstName = data.recipientName.split(" ")[0] || data.recipientName || "there";
  const subject = `You're signed up: ${data.eventName} — ${data.churchName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#FEFCF9;font-family:'DM Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FEFCF9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Logo -->
          <tr>
            <td style="padding:0 0 32px;">
              <span style="font-family:'DM Sans',Arial,sans-serif;font-size:22px;font-weight:700;color:#2D3047;">Volunteer</span><span style="font-family:'DM Sans',Arial,sans-serif;font-size:22px;font-weight:700;color:#E07A5F;">Cal</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;border:1px solid #EDEDE9;padding:40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 0 8px;">
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#9A9BB5;">
                      ${escapeHtml(data.churchName)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px;">
                    <h1 style="margin:0;font-family:'DM Serif Display',Georgia,serif;font-size:28px;font-weight:400;color:#2D3047;line-height:1.3;">
                      You&rsquo;re signed up, ${escapeHtml(firstName)}!
                    </h1>
                  </td>
                </tr>
                <!-- Event details card -->
                <tr>
                  <td style="padding:0 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;border:1px solid #EDEDE9;">
                      <tr>
                        <td style="padding:24px;">
                          <h2 style="margin:0 0 8px;font-family:'DM Serif Display',Georgia,serif;font-size:22px;font-weight:400;color:#2D3047;">
                            ${escapeHtml(data.eventName)}
                          </h2>
                          <p style="margin:0 0 12px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#6B6D8A;">
                            📅 ${escapeHtml(data.eventDate)} &nbsp;&bull;&nbsp; 🕐 ${escapeHtml(data.eventTime)}
                          </p>
                          <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#2D3047;">
                            <strong>Your role:</strong> ${escapeHtml(data.roleTitle)}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px;">
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.6;color:#6B6D8A;">
                      Thanks for volunteering! The event organizer will follow up with any final details closer to the date.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 0 16px;">
                    <a href="${data.eventUrl}" style="display:inline-block;background-color:#E07A5F;color:#FFFFFF;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;">
                      View Event Details
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0 0;">
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.5;color:#9A9BB5;">
                      Didn&rsquo;t sign up for this? You can safely ignore this email — no further action needed.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 0 0;text-align:center;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#9A9BB5;">
                Sent by <span style="color:#2D3047;">Volunteer</span><span style="color:#E07A5F;">Cal</span> on behalf of ${escapeHtml(data.churchName)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You're signed up: ${data.eventName} — ${data.churchName}

Hi ${firstName},

You're signed up to volunteer at:

${data.eventName}
Date: ${data.eventDate}
Time: ${data.eventTime}
Your role: ${data.roleTitle}

Thanks for volunteering! The event organizer will follow up with any final details closer to the date.

View event details: ${data.eventUrl}

Didn't sign up for this? You can safely ignore this email — no further action needed.

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
