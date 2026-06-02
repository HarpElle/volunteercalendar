/**
 * Audit log primitive (Track F.2).
 *
 * Append-only log of sensitive operations. Used for:
 *   - Customer support: "who changed Sarah's role last Tuesday?"
 *   - Compliance: child-data access trail
 *   - Incident response: tracing what happened during an outage
 *   - Procurement: a real Activity feed builds trust with paying churches
 *
 * Schema is denormalized intentionally — each row is independently readable
 * and survives schema changes upstream. Writes are fire-and-forget;
 * audit-log failures must never block the actual business operation.
 *
 * Storage: top-level `audit_logs` collection. Firestore rules deny client
 * reads/writes; admin reads happen through /api/admin/audit-logs (Track F.3
 * builds the UI on top of this).
 */

import { adminDb } from "@/lib/firebase/admin";
import { log } from "@/lib/log";

/** Stable, lowercased dot-namespaced action identifier. */
export type AuditAction =
  // Schedule lifecycle
  | "schedule.publish"
  | "schedule.unpublish"
  | "schedule.delete"
  | "schedule.notify_leads"
  // Membership lifecycle
  | "membership.invite"
  | "membership.approve"
  | "membership.accept_invite"
  | "membership.role_change"
  | "membership.remove"
  | "membership.deactivate"
  // Org lifecycle
  | "org.create"
  | "org.delete"
  | "org.tier_change"
  | "org.transfer_ownership"
  /**
   * Wave 11 Org Branding: org admin uploaded a new logo to Firebase
   * Storage and updated the church doc's logo_url. Metadata captures
   * the new URL + file size + format (no PII). The previous logo, if
   * any, is deleted from Storage to keep the bucket tidy.
   */
  | "org.brand_logo_updated"
  /**
   * Wave 11 Org Branding: org admin removed the custom logo. The
   * Storage object is deleted and logo_url is set back to null.
   * Surfaces revert to the VolunteerCal mark on next render.
   */
  | "org.brand_logo_removed"
  /**
   * Wave 12 A: a volunteer requested a swap (someone to cover their
   * scheduled shift). Backend creates the SwapRequest record + fans
   * out in-app notifications to ministry teammates. Metadata captures
   * the swap_id, assignment_id, ministry_id, and how many teammates
   * were notified (no PII).
   */
  | "assignment.swap_requested"
  /**
   * Wave 12 A: a teammate accepted an open swap request. The
   * assignment was atomically reassigned to them. Both the original
   * requester and the accepting volunteer get a swap_resolved
   * in-app notification (existing PATCH flow already does that).
   * Audit records who took whose shift for compliance.
   */
  | "assignment.swap_accepted"
  /**
   * Wave 12 B: a volunteer hit the day-of urgent absence path
   * ("I can't make it today" — sick, flat tire, etc.). The route
   * SMS-fans-out to schedulers + admins regardless of their normal
   * notification preferences. Material because (a) it overrides
   * opt-out and (b) churches want a queryable signal for how often
   * day-of absences happen by ministry/volunteer. Metadata captures
   * item_type, item_id, ministry_id, channel counts, and the
   * volunteer's optional note (truncated to 200 chars).
   */
  | "volunteer.urgent_absence_alerted"
  // Billing (Stripe)
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_canceled"
  | "billing.invoice_paid"
  | "billing.invoice_failed"
  | "billing.dispute_created"
  // Platform admin
  | "platform.tier_override"
  | "platform.org_export"
  // Kiosk / check-in (children's data)
  | "kiosk.station_create"
  | "kiosk.station_revoke"
  | "kiosk.station_reissue_code"
  // P0-1: station type architecture
  | "kiosk.station_type_changed"
  | "kiosk.checkout_blocked_self_service"
  /**
   * P0-2F defense-in-depth: server-side block-list gate fired during
   * /api/checkin/checkout because the kiosk client didn't pass the
   * acknowledged_blocks flag AND active blocks were found. Indicates
   * either the preview was skipped, the preview query had a bug, or
   * an attacker bypassed the kiosk UI. Outcome: "denied".
   */
  | "kiosk.checkout_blocked_pending_review"
  // P0-2: authorized-pickup contacts + blocked-pickup list + ERT
  | "pickup.authorized_added"
  | "pickup.authorized_removed"
  | "pickup.authorized_photo_added"
  | "pickup.blocked_added"
  | "pickup.blocked_removed"
  | "pickup.blocked_photo_added"
  | "pickup.blocked_photo_removed"
  /** Court-order PDF / supporting document attached to a blocked-pickup entry. */
  | "pickup.blocked_document_added"
  | "pickup.blocked_document_removed"
  | "pickup.authorized_photo_removed"
  /** Sub-PR G: parent self-service pickup-list operations. */
  | "pickup.authorized_parent_added"
  | "pickup.authorized_parent_remove_requested"
  | "pickup.authorized_parent_remove_canceled"
  | "pickup.authorized_parent_change_notified"
  /** Operator confirmed the on-site pickup person matches an authorized
   *  contact at the staffed-station checkout step. */
  | "kiosk.pickup_person_confirmed"
  /** A blocked-pickup person attempted to take a child home. Legally
   *  material — this is the row that proves the church recognized the
   *  block. Metadata includes blocked_pickup_id + session_id. */
  | "kiosk.blocked_pickup_attempted"
  /** Emergency Response Team contact was paged by SMS following a
   *  blocked-pickup attempt. One row per recipient. */
  | "kiosk.ert_notified"
  | "kiosk.activate"
  | "kiosk.lookup"
  | "kiosk.checkin"
  | "kiosk.checkout"
  | "kiosk.register_visitor"
  | "kiosk.medical_data_revealed"
  /**
   * Wave 9 P0-4: operator acknowledged the medical-alert modal at
   * check-in. Distinct from `kiosk.medical_data_revealed` (tap-to-
   * expand on the roster). Lets reports distinguish "alert delivered
   * + acknowledged" vs. "alert delivered, never confirmed" — the
   * legibility gap the HIPAA-aware visibility config closes.
   */
  | "kiosk.alert_acknowledged"
  /**
   * Wave 9 P0-5: ratio enforcement + worker check-in.
   *
   * - `room.volunteer_checked_in` / `_checked_out`: tracks the
   *   adults responsible for a room throughout the service.
   *   Distinct from `kiosk.checkin` (which tracks CHILDREN) — these
   *   are the people the policy gate counts.
   * - `kiosk.ratio_warning_shown`: emitted when a check-in attempt
   *   crosses the warning threshold but is still below the hard
   *   violation line. Lets the kiosk show an amber banner; surfaces
   *   in platform monitoring as a per-org signal.
   * - `kiosk.ratio_violation_override`: emitted when an over-ratio
   *   check-in is allowed via the staffed-station-signed
   *   `X-Ratio-Override` header. Legally material — the row that
   *   proves a human operator made the call to exceed the policy.
   */
  | "room.volunteer_checked_in"
  | "room.volunteer_checked_out"
  | "kiosk.ratio_warning_shown"
  | "kiosk.ratio_violation_override"
  /**
   * Wave 10 W10-1: per-check-in pickup recipient selection. Emitted
   * once per check-in batch, capturing how many contacts the operator
   * indicated would be picking up today. Lets compliance trace
   * "who was authorized for THIS check-in" without re-reading the
   * session doc — important for audit-trail surveys.
   */
  | "kiosk.recipients_selected"
  /**
   * Wave 10 W10-2: a checked-in volunteer loaded their personal
   * teacher dashboard. Captures who-saw-what-and-when on the
   * children's data surface; complements the kiosk-side
   * `kiosk.medical_data_revealed` for the person-anchored path.
   * Fires at most once per dashboard fetch (the page auto-refreshes
   * but we de-duplicate via a short server-side cache to avoid
   * filling audit_logs with poll noise).
   */
  | "teacher.dashboard_viewed"
  /**
   * Wave 10 W10-3: a checked-in volunteer paged the parent for a
   * specific session from the teacher dashboard. SMS fans out to
   * the primary guardian + each `present_recipients` entry on the
   * session, deduped by normalized phone. Metadata captures the
   * session, the room, the recipient count (NOT the phone numbers),
   * and an optional teacher-supplied note (capped at 200 chars,
   * stored verbatim so compliance can review what was said).
   */
  | "teacher.parent_paged"
  /**
   * Wave 10 W10-5A: a household downloaded (or re-downloaded) their
   * Apple Wallet family pass. The pass carries no medical or
   * contact data, but it does identify a household and list
   * children's first names, so the access trail matters.
   *
   * Two distinct events both use this code:
   *   - `outcome: "ok"` — successful pass build + download.
   *   - `outcome: "denied"` — a signed-URL request failed
   *     verification (expired or tampered). Useful for detecting
   *     probes against the signing secret.
   */
  | "wallet.family_pass_generated"
  /**
   * Wave 10 W10-4: an admin accessed the emergency evacuation
   * roster — the cross-room sweep view that surfaces full medical
   * + parent-contact data regardless of the HIPAA-aware
   * `medical_visibility` config, because the evacuation marshal or
   * EMT needs the data immediately in an actual emergency.
   *
   * Material every time it fires. Legitimate uses (fire drill, real
   * evacuation, missing child) all coincide with documented incidents
   * the org can correlate. Unexpected fires of this audit code
   * (especially outside service hours) are the signal a board would
   * want to investigate. Hence:
   *   - No de-duplication. Every fetch lands one row.
   *   - Metadata captures date, total_children, total_rooms, and
   *     the optional `reason` the admin acknowledged in the consent
   *     modal. No PII (no names, no phones).
   */
  | "admin.emergency_roster_accessed"
  /** Wave 9 P0-3: per-volunteer restrictions + raw bg-check / SOR audit.
   *  Together these form the legal-defensibility trail for the "cannot
   *  serve with children" gate (ECAP Indicator 3.15). */
  | "volunteer.restriction_added"
  | "volunteer.restriction_lifted"
  | "volunteer.background_check_initiated"
  | "volunteer.background_check_completed"
  /** Raw bg-check expiry cron auto-marked status="expired". */
  | "volunteer.background_check_expired_auto"
  /** Explicit Sex Offender Registry check logged. */
  | "volunteer.sor_check_logged"
  // Data export
  | "export.people"
  | "export.assignments"
  | "export.song_usage"
  | "export.attendance"
  // Short links
  | "short_link.create_external"
  // Authentication / MFA (Wave 4.2)
  | "auth.mfa_enrolled"
  | "auth.mfa_disabled"
  | "auth.mfa_recovery_codes_regenerated"
  | "auth.mfa_recovery_code_used"
  // Generic catch-all so future ops can audit without a code change here
  | (string & { __brand?: "audit" });

export interface AuditEntry {
  /** Doc ID, autogenerated. */
  id?: string;
  /** Org scope. Null for platform-admin actions not tied to a single church. */
  church_id: string | null;
  /**
   * Acting principal. One of:
   *   - "user:<uid>"      authenticated user
   *   - "kiosk:<id>"      kiosk station
   *   - "system"          server-initiated (cron, webhook)
   *   - "platform_admin:<uid>"  acting in platform-admin capacity
   */
  actor: string;
  /** Snake/dot-cased action identifier; see AuditAction. */
  action: AuditAction;
  /** What was acted upon, if applicable. */
  target_type?: string | null;
  target_id?: string | null;
  /** Optional small JSON metadata blob. PII-redacted by callers. */
  metadata?: Record<string, unknown>;
  /** "ok" | "denied" | "failed" — distinguishes successful actions from denials. */
  outcome: "ok" | "denied" | "failed";
  /** ISO timestamp. */
  created_at: string;
  /** Optional request id for correlation with logs/Sentry. */
  request_id?: string | null;
}

/**
 * Write an audit log entry. Fire-and-forget; failures are swallowed and
 * logged to console (Sentry will pick them up if installed). Never blocks
 * the caller — if the audit write fails, the business op still succeeds.
 *
 * Note: PII redaction is the caller's responsibility. Don't put raw phone
 * numbers, child medical notes, etc. in metadata. Reference IDs only.
 */
export async function audit(entry: Omit<AuditEntry, "created_at" | "id">): Promise<void> {
  try {
    await adminDb.collection("audit_logs").add({
      ...entry,
      metadata: entry.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    log.error("audit log write failed", { error: err, action: entry.action, target_type: entry.target_type, target_id: entry.target_id });
  }
}

/**
 * Convenience: build the actor string for an authenticated user. Use for
 * org-scoped actions performed by a logged-in admin.
 */
export function userActor(uid: string): string {
  return `user:${uid}`;
}

export function kioskActor(stationId: string): string {
  return `kiosk:${stationId}`;
}

export function platformAdminActor(uid: string): string {
  return `platform_admin:${uid}`;
}

export const SYSTEM_ACTOR = "system";
