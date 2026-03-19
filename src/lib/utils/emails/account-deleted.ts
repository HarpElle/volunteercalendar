/**
 * Account-deleted email — sent when a user deletes their VolunteerCal account.
 */

import {
  wrapInLayout,
  P,
  P_LAST,
  BOLD,
} from "./base-layout";

export interface AccountDeletedEmailData {
  userName: string;
}

export function buildAccountDeletedEmail(data: AccountDeletedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = data.userName.split(" ")[0] || "there";

  const subject = "Your VolunteerCal account has been deleted";

  const body = `
              <p ${P}>
                Hi ${firstName},
              </p>
              <p ${P}>
                Your VolunteerCal account has been successfully deleted, and all associated data has been removed from our systems.
              </p>
              <p ${P}>
                We truly appreciate the time you spent with us. Whether you coordinated a single service or managed months of schedules, your work made a difference for the teams you served alongside.
              </p>
              <p ${P}>
                If you ever want to come back, you're always welcome — just sign up again at <strong ${BOLD}>volunteercal.org</strong>.
              </p>
              <p ${P_LAST}>
                In the meantime, if you know someone who could benefit from simpler volunteer scheduling, we'd be grateful if you shared VolunteerCal with them. Wishing you all the best.
              </p>`;

  const html = wrapInLayout({
    headerText: "Account Deleted",
    body,
  });

  const text = `Account Deleted

Hi ${firstName},

Your VolunteerCal account has been successfully deleted, and all associated data has been removed from our systems.

We truly appreciate the time you spent with us. Whether you coordinated a single service or managed months of schedules, your work made a difference for the teams you served alongside.

If you ever want to come back, you're always welcome -- just sign up again at volunteercal.org.

In the meantime, if you know someone who could benefit from simpler volunteer scheduling, we'd be grateful if you shared VolunteerCal with them. Wishing you all the best.

--
VolunteerCal - Thoughtfully built by HarpElle`;

  return { subject, html, text };
}
