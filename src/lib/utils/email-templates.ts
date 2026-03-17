/** Branded email templates for VolunteerCal */

// ─── Welcome Email ───────────────────────────────────────────────────────

interface WelcomeEmailData {
  userName: string;
}

export function buildWelcomeEmail(data: WelcomeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = "Welcome to VolunteerCal — let's get your team set up";

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
                Welcome to Volunteer<span style="color:#E87461;">Cal</span>
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Thanks for creating your account. VolunteerCal was built to take the guesswork out of volunteer scheduling — so you can spend less time juggling spreadsheets and more time with your team.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Here's how to get started:
              </p>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:14px;">
                          <span style="display:inline-block;width:24px;height:24px;border-radius:50%;background-color:#2D2B55;color:#ffffff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;">1</span>
                          <span style="font-size:14px;font-weight:600;color:#2D2B55;">Set up your church</span><br>
                          <span style="font-size:13px;color:#4A4A6A;margin-left:34px;display:inline-block;">Name, timezone, and scheduling preferences.</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:14px;">
                          <span style="display:inline-block;width:24px;height:24px;border-radius:50%;background-color:#2D2B55;color:#ffffff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;">2</span>
                          <span style="font-size:14px;font-weight:600;color:#2D2B55;">Add a ministry</span><br>
                          <span style="font-size:13px;color:#4A4A6A;margin-left:34px;display:inline-block;">Create your first ministry and assign it a color.</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:14px;">
                          <span style="display:inline-block;width:24px;height:24px;border-radius:50%;background-color:#2D2B55;color:#ffffff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;">3</span>
                          <span style="font-size:14px;font-weight:600;color:#2D2B55;">Add your volunteers</span><br>
                          <span style="font-size:13px;color:#4A4A6A;margin-left:34px;display:inline-block;">Import from CSV or add them one at a time.</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <span style="display:inline-block;width:24px;height:24px;border-radius:50%;background-color:#2D2B55;color:#ffffff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;">4</span>
                          <span style="font-size:14px;font-weight:600;color:#2D2B55;">Generate your first schedule</span><br>
                          <span style="font-size:13px;color:#4A4A6A;margin-left:34px;display:inline-block;">Pick a date range and let the scheduler do the rest.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="https://volunteercal.com/dashboard" style="display:inline-block;background-color:#E87461;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
                      Go to Your Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;line-height:1.6;color:#4A4A6A;">
                If you have any questions or run into anything, just reply to this email — we're happy to help.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCal</span> · Thoughtfully built by <span style="color:#9A9BB5;">HarpElle</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome to VolunteerCal

Hi ${firstName},

Thanks for creating your account. VolunteerCal was built to take the guesswork out of volunteer scheduling — so you can spend less time juggling spreadsheets and more time with your team.

Here's how to get started:

1. Set up your church — name, timezone, and scheduling preferences.
2. Add a ministry — create your first ministry and assign it a color.
3. Add your volunteers — import from CSV or add them one at a time.
4. Generate your first schedule — pick a date range and let the scheduler do the rest.

Go to your dashboard: https://volunteercal.com/dashboard

If you have any questions, just reply to this email — we're happy to help.

—
VolunteerCal · Thoughtfully built by HarpElle`;

  return { subject, html, text };
}

// ─── Confirmation Email ──────────────────────────────────────────────────

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
                Sent by <span style="color:#E87461;">VolunteerCal</span> on behalf of ${data.churchName}
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
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}

// ─── Purchase Thank-You Email ────────────────────────────────────────────

interface PurchaseThankYouData {
  userName: string;
  planName: string;
  churchName: string;
}

export function buildPurchaseThankYouEmail(data: PurchaseThankYouData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `Thanks for upgrading to ${data.planName}`;

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
          <tr>
            <td style="background-color:#2D2B55;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                You're All Set
              </h1>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.65);">
                ${data.planName} Plan
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Thanks for upgrading ${data.churchName} to the <strong style="color:#2D2B55;">${data.planName}</strong> plan. Your new features are already active — no setup needed.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                If you ever have questions about your plan or need help with anything, just reply to this email. We're here.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="https://volunteercal.com/dashboard/billing" style="display:inline-block;background-color:#E87461;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
                      View Your Plan
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCal</span> · Thoughtfully built by HarpElle
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Thanks for Upgrading — ${data.planName} Plan

Hi ${firstName},

Thanks for upgrading ${data.churchName} to the ${data.planName} plan. Your new features are already active — no setup needed.

If you ever have questions about your plan or need help, just reply to this email.

View your plan: https://volunteercal.com/dashboard/billing

—
VolunteerCal · Thoughtfully built by HarpElle`;

  return { subject, html, text };
}

// ─── Re-engagement Email ─────────────────────────────────────────────────

interface ReEngagementData {
  userName: string;
  churchName: string;
  daysSinceLastLogin: number;
}

export function buildReEngagementEmail(data: ReEngagementData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `${data.churchName}'s schedule is waiting for you`;

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
          <tr>
            <td style="background-color:#2D2B55;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                We Missed You
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                It's been about ${data.daysSinceLastLogin} days since you last visited VolunteerCal. Your account and ${data.churchName}'s data are right where you left them.
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                If you ran into something that didn't work the way you expected, we'd genuinely like to hear about it. Just reply to this email — it goes straight to a real person.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="https://volunteercal.com/dashboard" style="display:inline-block;background-color:#E87461;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
                      Back to Your Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCal</span> · Thoughtfully built by HarpElle
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `We Missed You

Hi ${firstName},

It's been about ${data.daysSinceLastLogin} days since you last visited VolunteerCal. Your account and ${data.churchName}'s data are right where you left them.

If you ran into something that didn't work the way you expected, we'd genuinely like to hear about it. Just reply to this email — it goes straight to a real person.

Back to your dashboard: https://volunteercal.com/dashboard

—
VolunteerCal · Thoughtfully built by HarpElle`;

  return { subject, html, text };
}

// ─── Free Tier Upsell Email ─────────────────────────────────────────────

interface UpsellData {
  userName: string;
  churchName: string;
  volunteerCount: number;
  volunteerLimit: number;
  ministryCount: number;
  ministryLimit: number;
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
          <tr>
            <td style="background-color:#2D2B55;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                ${nearLimit ? "You're Getting Close" : "Room to Grow"}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                ${nearLimit
                  ? `${data.churchName} now has <strong style="color:#2D2B55;">${data.volunteerCount} of ${data.volunteerLimit}</strong> volunteers on the Free plan. Once you hit the limit, you won't be able to add more until you upgrade.`
                  : `${data.churchName} is making great use of VolunteerCal with ${data.volunteerCount} volunteers and ${data.ministryCount} ${data.ministryCount === 1 ? "ministry" : "ministries"}. Here's what you could unlock with a paid plan:`}
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
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
                    </table>
                  </td>
                </tr>
              </table>

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
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCal</span> · Thoughtfully built by HarpElle
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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

—
VolunteerCal · Thoughtfully built by HarpElle`;

  return { subject, html, text };
}

// ─── Invite Email ─────────────────────────────────────────────────────────

interface InviteEmailData {
  inviteeName: string;
  churchName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

export function buildInviteEmail(data: InviteEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.inviteeName.split(" ")[0] || "there";

  const subject = `You've been invited to join ${data.churchName} on VolunteerCal`;

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
          <tr>
            <td style="background-color:#2D2B55;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                You're Invited
              </h1>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.65);">
                ${data.churchName}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                <strong style="color:#2D2B55;">${data.inviterName}</strong> has invited you to join <strong style="color:#2D2B55;">${data.churchName}</strong> on VolunteerCal as a <strong style="color:#2D2B55;">${data.role}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                VolunteerCal makes it simple to see when you're scheduled, confirm your availability, and stay in the loop — all in one place.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="${data.acceptUrl}" style="display:inline-block;background-color:#E87461;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;line-height:1.5;color:#9A9BB5;text-align:center;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCal</span> on behalf of ${data.churchName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You've Been Invited to ${data.churchName}

Hi ${firstName},

${data.inviterName} has invited you to join ${data.churchName} on VolunteerCal as a ${data.role}.

VolunteerCal makes it simple to see when you're scheduled, confirm your availability, and stay in the loop — all in one place.

Accept your invitation: ${data.acceptUrl}

If you weren't expecting this invitation, you can safely ignore this email.

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}

// ─── Membership Approved Email ────────────────────────────────────────────

interface MembershipApprovedData {
  userName: string;
  churchName: string;
  dashboardUrl: string;
}

export function buildMembershipApprovedEmail(data: MembershipApprovedData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = `You've been approved to join ${data.churchName}`;

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
          <tr>
            <td style="background-color:#2D2B55;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                You're In!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                Great news — your request to join <strong style="color:#2D2B55;">${data.churchName}</strong> has been approved. You can now view your schedule, set your availability, and more.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="${data.dashboardUrl}" style="display:inline-block;background-color:#E87461;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                Sent by <span style="color:#E87461;">VolunteerCal</span> on behalf of ${data.churchName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You've Been Approved — ${data.churchName}

Hi ${firstName},

Great news — your request to join ${data.churchName} has been approved. You can now view your schedule, set your availability, and more.

Go to your dashboard: ${data.dashboardUrl}

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
