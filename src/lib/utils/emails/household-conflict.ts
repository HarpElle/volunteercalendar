/**
 * Household Conflict notification — sent to families when a published
 * schedule violates one of their household constraints.
 */

import {
  wrapInLayout,
  mutedCenter,
  onBehalfFooter,
  P,
  BOLD,
} from "./base-layout";

export interface HouseholdConflictEmailData {
  familyName: string;
  memberNames: string[];
  churchName: string;
  conflictDate: string;
  constraintDescription: string;
  recipientEmail: string;
}

export function buildHouseholdConflictEmail(data: HouseholdConflictEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Scheduling note for the ${data.familyName} — ${data.churchName}`;

  const memberList = data.memberNames.join(", ");

  const body = `
              <p ${P}>
                Hi ${data.familyName},
              </p>
              <p ${P}>
                We wanted to let you know that the recently published schedule has <strong ${BOLD}>${memberList}</strong> scheduled in a way that conflicts with your family's preference: <strong ${BOLD}>${data.constraintDescription}</strong> on <strong ${BOLD}>${data.conflictDate}</strong>.
              </p>
              <p ${P}>
                We'll work on adjusting this in the next schedule. If this is urgent, please reach out to your scheduling team.
              </p>

              ${mutedCenter("Thank you for your flexibility and willingness to serve!")}`;

  const html = wrapInLayout({
    headerText: "Family Scheduling Note",
    headerSubtitle: data.churchName,
    body,
    footerHtml: onBehalfFooter(data.churchName),
  });

  const text = `Family Scheduling Note — ${data.churchName}

Hi ${data.familyName},

We wanted to let you know that the recently published schedule has ${memberList} scheduled in a way that conflicts with your family's preference: ${data.constraintDescription} on ${data.conflictDate}.

We'll work on adjusting this in the next schedule. If this is urgent, please reach out to your scheduling team.

Thank you for your flexibility and willingness to serve!

—
Sent by VolunteerCal on behalf of ${data.churchName}`;

  return { subject, html, text };
}
