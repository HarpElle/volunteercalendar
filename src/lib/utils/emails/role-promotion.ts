/**
 * Role-promotion email — sent when a member is promoted to scheduler or admin.
 */

import {
  wrapInLayout,
  ctaButton,
  mutedCenter,
  onBehalfFooter,
  P,
  P_LAST,
  BOLD,
} from "./base-layout";
import { escapeHtml } from "./escape";

export interface RolePromotionEmailData {
  userName: string;
  newRole: string;
  churchName: string;
  /**
   * Wave 11 Sub-PR C: public URL of the church's uploaded logo. When
   * present, renders above the header text. Null/undefined falls back
   * to the original text-only header. Passed through to wrapInLayout.
   */
  churchLogoUrl?: string | null;
}

export function buildRolePromotionEmail(data: RolePromotionEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";
  const roleLower = data.newRole.toLowerCase();

  const subject = `You've been promoted to ${data.newRole} at ${data.churchName}`;

  const capabilitiesHtml =
    roleLower === "admin"
      ? "You can now manage organization settings, teams, people, notifications, and the full scheduling workflow."
      : "You can now create and publish schedules, manage the volunteer roster, and help coordinate your team's serving schedule.";

  const capabilitiesText = capabilitiesHtml;

  const body = `
              <p ${P}>
                Hi ${escapeHtml(firstName)},
              </p>
              <p ${P}>
                Great news — you've been promoted to <strong ${BOLD}>${escapeHtml(data.newRole)}</strong> at <strong ${BOLD}>${escapeHtml(data.churchName)}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4A4A6A;">
                ${capabilitiesHtml} We're glad to have you in this role.
              </p>

              ${ctaButton("https://volunteercal.com/dashboard", "Go to Dashboard")}

              ${mutedCenter("You're receiving this because your role was updated at " + escapeHtml(data.churchName) + ".")}`;

  const html = wrapInLayout({
    headerText: "Congratulations!",
    headerSubtitle: data.churchName,
    churchLogoUrl: data.churchLogoUrl,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Congratulations! — ${data.churchName}

Hi ${firstName},

Great news -- you've been promoted to ${data.newRole} at ${data.churchName}.

${capabilitiesText} We're glad to have you in this role.

Go to Dashboard: https://volunteercal.com/dashboard

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
