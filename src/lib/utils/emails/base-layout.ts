import { escapeHtml } from "./escape";

/**
 * Shared HTML email layout for VolunteerCal.
 *
 * Design tokens (inline — email clients ignore external CSS):
 *   Background:  #FEFCF9  (vc-bg)
 *   Card:        #FFFFFF
 *   Header bg:   #2D3047  (vc-indigo — matches globals.css)
 *   Coral accent: #E07A5F (vc-coral — matches globals.css)
 *   Body text:   #4A4A6A
 *   Muted text:  #9A9BB5
 *   Warm surface: #FBF7F0 (vc-bg-warm)
 *   Border:      #E8E4DE
 */

export interface LayoutOptions {
  /** The large heading inside the indigo header banner. */
  headerText: string;
  /** Optional subtitle shown smaller below the heading. */
  headerSubtitle?: string;
  /** The inner HTML for the email body (between header and footer). */
  body: string;
  /** Footer attribution line. Defaults to the HarpElle tagline. */
  footerHtml?: string;
}

/**
 * Wrap email body content in the branded VolunteerCal layout.
 * Returns a complete `<!DOCTYPE html>` string.
 */
export function wrapInLayout(opts: LayoutOptions): string {
  const subtitle = opts.headerSubtitle
    ? `<p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.65);">${opts.headerSubtitle}</p>`
    : "";

  const footer =
    opts.footerHtml ??
    `<span style="color:#2D3047;">Volunteer</span><span style="color:#E07A5F;">Cal</span> &middot; Thoughtfully built by HarpElle`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FEFCF9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FEFCF9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E8E4DE;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2D3047;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                ${opts.headerText}
              </h1>
              ${subtitle}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              ${opts.body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E8E4DE;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9BB5;">
                ${footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Standard paragraph style used across email templates. */
export const P = 'style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4A4A6A;"';

/** Last paragraph (no bottom margin). */
export const P_LAST = 'style="margin:0;font-size:15px;line-height:1.7;color:#4A4A6A;"';

/** Bold inline text in indigo. */
export const BOLD = 'style="color:#2D3047;"';

/** Warm detail card wrapper (for assignment details, event details, etc.). */
export function detailCard(innerHtml: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF7F0;border-radius:12px;margin-bottom:24px;">
  <tr><td style="padding:20px 24px;">${innerHtml}</td></tr>
</table>`;
}

/** Detail row inside a detail card. */
export function detailRow(label: string, value: string, extra?: string): string {
  return `<tr>
  <td style="padding-bottom:12px;">
    <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">${label}</span><br>
    <span style="font-size:15px;font-weight:600;color:#2D3047;">${value}</span>${extra ? `<span style="font-size:13px;color:#9A9BB5;"> &middot; ${extra}</span>` : ""}
  </td>
</tr>`;
}

/** Centered CTA button. */
export function ctaButton(href: string, label: string, color = "#E07A5F"): string {
  return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding-bottom:16px;">
      <a href="${href}" style="display:inline-block;background-color:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:-0.2px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

/** Small centered muted text (often below a CTA). */
export function mutedCenter(text: string): string {
  return `<p style="margin:0;font-size:12px;line-height:1.5;color:#9A9BB5;text-align:center;">${text}</p>`;
}

/** "On behalf of" footer for org-scoped emails. */
export function onBehalfFooter(churchName: string): string {
  return `Sent by <span style="color:#2D3047;">Volunteer</span><span style="color:#E07A5F;">Cal</span> on behalf of ${escapeHtml(churchName)}`;
}

/**
 * Format an ISO date string as a long human-readable date.
 * e.g. "2026-03-22" → "Sunday, March 22, 2026"
 */
export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
