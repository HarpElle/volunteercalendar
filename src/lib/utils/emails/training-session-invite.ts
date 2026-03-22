/** Invitation email for a training session tied to a prerequisite step. */

import {
  wrapInLayout,
  P,
  detailCard,
  detailRow,
  ctaButton,
  onBehalfFooter,
  formatDateLong,
  BOLD,
} from "./base-layout";

export interface TrainingSessionInviteEmailData {
  volunteerName: string;
  churchName: string;
  sessionTitle: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  location: string;
  spotsRemaining: number;
  rsvpUrl: string;
}

export function buildTrainingSessionInviteEmail(data: TrainingSessionInviteEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.volunteerName.split(" ")[0] || "there";

  const subject = `You're invited \u2014 ${data.sessionTitle} on ${formatDateLong(data.sessionDate)}`;

  const body = `<p ${P}>
    Hi ${firstName},
  </p>
  <p ${P}>
    You're invited to <strong ${BOLD}>${data.sessionTitle}</strong> at ${data.churchName}. This session is part of your onboarding journey.
  </p>
  ${detailCard(`<table width="100%" cellpadding="0" cellspacing="0">
    ${detailRow("Date", formatDateLong(data.sessionDate))}
    ${detailRow("Time", data.startTime, data.endTime)}
    ${detailRow("Location", data.location)}
    <tr>
      <td>
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9A9BB5;">Spots Remaining</span><br>
        <span style="font-size:15px;font-weight:600;color:${data.spotsRemaining <= 3 ? "#E87461" : "#2D2B55"};">${data.spotsRemaining}</span>
      </td>
    </tr>
  </table>`)}
  ${ctaButton(data.rsvpUrl, "RSVP Now", "#6B9B7D")}`;

  const html = wrapInLayout({
    headerText: "Training Session Invitation",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Training Session Invitation \u2014 ${data.churchName}

Hi ${firstName},

You're invited to "${data.sessionTitle}" at ${data.churchName}.

  Date: ${formatDateLong(data.sessionDate)}
  Time: ${data.startTime} \u2013 ${data.endTime}
  Location: ${data.location}
  Spots remaining: ${data.spotsRemaining}

RSVP here: ${data.rsvpUrl}

\u2014
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
