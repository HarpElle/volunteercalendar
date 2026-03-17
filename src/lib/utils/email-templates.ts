/** Branded email templates for VolunteerCalendar */

interface ConfirmationEmailData {
  volunteerName: string;
  churchName: string;
  serviceName: string;
  ministryName: string;
  roleTitle: string;
  serviceDate: string;
  startTime: string;
  confirmUrl: string;
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildConfirmationEmail(data: ConfirmationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const formattedDate = formatDateLong(data.serviceDate);

  const subject = `You're scheduled to serve — ${formattedDate}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#FEFCF9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FEFCF9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E8E4DE;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2D2B55;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                You're Scheduled to Serve
              </h1>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.65);">
                ${data.churchName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4A4A6A;">
                Hi <strong style="color:#2D2B55;">${data.volunteerName}</strong>,
                you've been scheduled to serve. Please confirm your availability below.
              </p>

              <!-- Assignment Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Date</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D2B55;">${formattedDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Service</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D2B55;">${data.serviceName}</span>
                          <span style="font-size:13px;color:#9A9BB5;"> · ${data.startTime}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Ministry</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D2B55;">${data.ministryName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Your Role</span><br>
                          <span style="font-size:15px;font-weight:600;color:#2D2B55;">${data.roleTitle}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <a href="${data.confirmUrl}" style="display:inline-block;background-color:#6B9B7D;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
                      Confirm or Decline
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;line-height:1.5;color:#9A9BB5;text-align:center;">
                Click the button above to confirm your availability or let us know if you can't make it.
                No login required.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCalendar</span> on behalf of ${data.churchName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You're Scheduled to Serve — ${data.churchName}

Hi ${data.volunteerName},

You've been scheduled to serve:

  Date: ${formattedDate}
  Service: ${data.serviceName} · ${data.startTime}
  Ministry: ${data.ministryName}
  Role: ${data.roleTitle}

Confirm or decline here (no login required):
${data.confirmUrl}

—
Sent by VolunteerCalendar on behalf of ${data.churchName}`;

  return { subject, html, text };
}
