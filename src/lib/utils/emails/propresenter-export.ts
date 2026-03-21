/**
 * ProPresenter export email template.
 * Sent 24 hours before a published service plan's service date.
 */

interface ProPresenterExportEmailParams {
  recipientName: string;
  churchName: string;
  serviceDate: string;
  planTheme: string | null;
  songCount: number;
  totalItems: number;
}

export function buildProPresenterExportEmail(
  params: ProPresenterExportEmailParams,
): { subject: string; text: string; html: string } {
  const {
    recipientName,
    churchName,
    serviceDate,
    planTheme,
    songCount,
    totalItems,
  } = params;

  const dateLabel = new Date(serviceDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const title = planTheme ?? `Service Plan`;
  const subject = `ProPresenter Export — ${title} (${dateLabel})`;

  const text = [
    `Hi ${recipientName},`,
    "",
    `Your ProPresenter export for ${dateLabel} is attached.`,
    "",
    `Service: ${title}`,
    `Date: ${dateLabel}`,
    `Songs: ${songCount}`,
    `Total items: ${totalItems}`,
    "",
    "Import this file into ProPresenter before your service.",
    "",
    "— VolunteerCal",
  ].join("\n");

  const html = `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="margin-bottom: 24px;">
        <p style="color: #2D3047; font-size: 16px; margin: 0;">Hi ${recipientName},</p>
      </div>
      <div style="background: #FBF7F0; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="color: #2D3047; font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">${title}</p>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px 0;">${dateLabel}</p>
        <table style="font-size: 14px; color: #374151;">
          <tr><td style="padding: 2px 12px 2px 0; color: #9CA3AF;">Songs</td><td>${songCount}</td></tr>
          <tr><td style="padding: 2px 12px 2px 0; color: #9CA3AF;">Total items</td><td>${totalItems}</td></tr>
        </table>
      </div>
      <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
        Your ProPresenter export is attached to this email. Import the JSON file into ProPresenter before your service.
      </p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
        Sent by VolunteerCal on behalf of ${churchName}
      </p>
    </div>
  `.trim();

  return { subject, text, html };
}
