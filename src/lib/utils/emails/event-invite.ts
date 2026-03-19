/**
 * Event invite email — sent when a volunteer is invited to sign up for an event.
 *
 * NOTE: This template uses a unique layout (DM Sans/DM Serif fonts, different
 * color scheme with #2C2E5A and #E07A5F, logo outside the card). It does NOT
 * use wrapInLayout — the HTML is self-contained.
 */

export interface EventInviteData {
  recipientName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventDescription?: string;
  churchName: string;
  signupUrl: string;
  senderName: string;
}

export function buildEventInviteEmail(data: EventInviteData) {
  const firstName = data.recipientName.split(" ")[0];
  const subject = `You're invited: ${data.eventName} — ${data.churchName}`;

  const descriptionBlock = data.eventDescription
    ? `<tr>
        <td style="padding: 0 0 24px;">
          <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #6B6D8A;">
            ${data.eventDescription}
          </p>
        </td>
      </tr>`
    : "";

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
              <span style="font-family:'DM Sans',Arial,sans-serif;font-size:22px;font-weight:700;color:#2C2E5A;">Volunteer</span><span style="font-family:'DM Sans',Arial,sans-serif;font-size:22px;font-weight:700;color:#E07A5F;">Cal</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;border:1px solid #EDEDE9;padding:40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 0 8px;">
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#9A9BB5;">
                      ${data.churchName}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px;">
                    <h1 style="margin:0;font-family:'DM Serif Display',Georgia,serif;font-size:28px;font-weight:400;color:#2C2E5A;line-height:1.3;">
                      ${firstName}, you're invited!
                    </h1>
                  </td>
                </tr>
                <!-- Event details card -->
                <tr>
                  <td style="padding:0 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;border:1px solid #EDEDE9;">
                      <tr>
                        <td style="padding:24px;">
                          <h2 style="margin:0 0 8px;font-family:'DM Serif Display',Georgia,serif;font-size:22px;font-weight:400;color:#2C2E5A;">
                            ${data.eventName}
                          </h2>
                          <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#6B6D8A;">
                            📅 ${data.eventDate} &nbsp;&bull;&nbsp; 🕐 ${data.eventTime}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${descriptionBlock}
                <tr>
                  <td style="padding:0 0 24px;">
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.6;color:#6B6D8A;">
                      ${data.senderName} has invited you to sign up for this event. Tap the button below to view details and volunteer.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 0 16px;">
                    <a href="${data.signupUrl}" style="display:inline-block;background-color:#E07A5F;color:#FFFFFF;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;">
                      View Event &amp; Sign Up
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 0 0;text-align:center;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#9A9BB5;">
                Sent by VolunteerCal on behalf of ${data.churchName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You're Invited: ${data.eventName} — ${data.churchName}

Hi ${firstName},

${data.senderName} has invited you to sign up for an event:

${data.eventName}
Date: ${data.eventDate}
Time: ${data.eventTime}${data.eventDescription ? `\n\n${data.eventDescription}` : ""}

Sign up here: ${data.signupUrl}

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
