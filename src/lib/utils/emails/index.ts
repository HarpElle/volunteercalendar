/** Barrel re-export — all email templates + base helpers */

export { wrapInLayout, formatDateLong, detailCard, detailRow, ctaButton, mutedCenter, onBehalfFooter } from "./base-layout";
export type { LayoutOptions } from "./base-layout";

export { buildWelcomeEmail } from "./welcome";
export { buildConfirmationEmail } from "./confirmation";
export { buildPurchaseThankYouEmail } from "./purchase-thank-you";
export { buildReEngagementEmail } from "./re-engagement";
export { buildUpsellEmail } from "./upsell";
export { buildInviteEmail } from "./invite";
export { buildReminderEmail, buildReminderSms } from "./reminder";
export { buildMembershipApprovedEmail } from "./membership-approved";
export { buildEventInviteEmail } from "./event-invite";
export { buildOrgDeletedEmail } from "./org-deleted";
export { buildAccountDeletedEmail } from "./account-deleted";
export { buildVacancyAlertEmail } from "./vacancy-alert";
export { buildAdminDepartureEmail } from "./admin-departure";
export { buildRolePromotionEmail } from "./role-promotion";
export { buildWelcomeToOrgEmail } from "./welcome-to-org";
export { buildOrgDeletedMembersEmail } from "./org-deleted-members";
export { buildOrgCreatedEmail } from "./org-created";
export { buildAssignmentChangeEmail } from "./assignment-change";
export { buildSelfRemovalAlertEmail } from "./self-removal-alert";
