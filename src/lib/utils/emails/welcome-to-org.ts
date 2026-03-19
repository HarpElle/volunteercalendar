/**
 * Welcome-to-org email — sent when a user joins (or requests to join) an organization.
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

export interface WelcomeToOrgEmailData {
  userName: string;
  churchName: string;
  isPending: boolean;
  role: string;
}

export function buildWelcomeToOrgEmail(data: WelcomeToOrgEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";
  const roleLower = data.role.toLowerCase();

  const subject = `Welcome to ${data.churchName} on VolunteerCal`;

  let statusParagraph: string;
  let statusText: string;

  if (data.isPending) {
    statusParagraph = `Your request to join <strong ${BOLD}>${data.churchName}</strong> has been submitted. An admin will review it and you'll be notified when approved.`;
    statusText = `Your request to join ${data.churchName} has been submitted. An admin will review it and you'll be notified when approved.`;
  } else {
    statusParagraph = `You're now part of <strong ${BOLD}>${data.churchName}</strong>! You can view your schedule, set your availability, and stay in the loop.`;
    statusText = `You're now part of ${data.churchName}! You can view your schedule, set your availability, and stay in the loop.`;
  }

  let roleCapabilitiesHtml = "";
  let roleCapabilitiesText = "";

  if (!data.isPending && (roleLower === "scheduler" || roleLower === "admin")) {
    const capabilities =
      roleLower === "admin"
        ? "As an admin, you can manage organization settings, teams, people, notifications, and the full scheduling workflow."
        : "As a scheduler, you can create and publish schedules, manage the volunteer roster, and help coordinate your team's serving schedule.";

    roleCapabilitiesHtml = `
              <p ${P}>
                ${capabilities}
              </p>`;
    roleCapabilitiesText = `\n\n${capabilities}`;
  }

  const ctaHtml = data.isPending
    ? ""
    : `${ctaButton("https://volunteercal.org/dashboard", "Go to Dashboard")}`;

  const mutedNote = data.isPending
    ? mutedCenter("We'll send you another email once your request has been reviewed.")
    : mutedCenter("You're receiving this because you joined " + data.churchName + " on VolunteerCal.");

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                ${statusParagraph}
              </p>${roleCapabilitiesHtml}

              ${ctaHtml}

              ${mutedNote}`;

  const html = wrapInLayout({
    headerText: "Welcome!",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const ctaText = data.isPending
    ? ""
    : "\n\nGo to Dashboard: https://volunteercal.org/dashboard";

  const text = `Welcome! — ${data.churchName}

Hi ${firstName},

${statusText}${roleCapabilitiesText}${ctaText}

--
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
