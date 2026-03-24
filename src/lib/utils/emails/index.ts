/** Barrel re-export — all email templates + base helpers */

export { wrapInLayout, formatDateLong, detailCard, detailRow, ctaButton, mutedCenter, onBehalfFooter } from "./base-layout";
export type { LayoutOptions } from "./base-layout";

export { buildWelcomeEmail, buildAccountCreatedEmail } from "./welcome";
export { buildConfirmationEmail } from "./confirmation";
export { buildBatchConfirmationEmail } from "./batch-confirmation";
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
export { buildAbsenceAlertEmail } from "./absence-alert";
export { buildAvailabilityWindowEmail } from "./availability-window";
export { buildApprovalRequestEmail } from "./approval-request";
export { buildApprovalReminderEmail } from "./approval-reminder";
export { buildHouseholdConflictEmail } from "./household-conflict";
export { buildStepCompletedEmail } from "./prerequisite-step-completed";
export { buildEligibleNotifyEmail } from "./prerequisite-eligible-notify";
export { buildExpiryWarningEmail } from "./prerequisite-expiry-warning";
export { buildPrerequisiteNudgeEmail } from "./prerequisite-nudge";
export { buildTrainingSessionInviteEmail } from "./training-session-invite";
export { buildDowngradeNotificationEmail } from "./downgrade-notification";
