/**
 * Transactional notification outbox (Track E.1).
 *
 * Decouples user-visible business writes (schedule publish, invite send,
 * billing state change) from external-provider notification delivery (Resend
 * email, Twilio SMS).
 *
 * Pattern:
 *   1. Business handler writes its data + appends NotificationOutboxEntry
 *      rows in the SAME Firestore batch / transaction.
 *   2. A drain cron (`/api/cron/outbox-drain`) periodically picks up
 *      `status: 'pending'` rows, attempts delivery, marks `sent` on success
 *      or `failed`/`pending` (for retry) with exponential backoff.
 *   3. After N failures the row is marked `dead_letter` for human review.
 *
 * Effect: a Resend outage during a publish no longer means "schedule says
 * published but volunteers never got notified" — the outbox cron drains
 * once Resend recovers. From the user's perspective, publish always
 * succeeds; delivery is eventually consistent.
 */

import { adminDb } from "@/lib/firebase/admin";

export type OutboxKind = "email" | "sms";
export type OutboxStatus = "pending" | "sent" | "failed" | "dead_letter";

export interface OutboxEmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Sender to use when dispatching. Defaults to noreply@harpelle.com. */
  from?: string;
  reply_to?: string;
}

export interface OutboxSmsPayload {
  to: string;
  body: string;
}

export interface NotificationOutboxEntry {
  id: string;
  /** Org scope, used for filtering and audit. Null for platform-level sends. */
  church_id: string | null;
  kind: OutboxKind;
  /** Stable origin tag like "schedule.publish", "invite", "reminder.24h" — used for metrics and retries scoped per-source. */
  origin: string;
  payload: OutboxEmailPayload | OutboxSmsPayload;
  status: OutboxStatus;
  attempts: number;
  /** Earliest timestamp at which the next attempt is allowed. ISO string. */
  next_attempt_at: string;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
  /** Optional reference back to the originating doc (e.g. "schedules/abc123"). */
  source_ref?: string | null;
}

const MAX_ATTEMPTS = 5;

/**
 * Schedule an email or SMS for delivery via the outbox. Called inside a
 * Firestore WriteBatch in the business handler so the row appears atomically
 * with the business write.
 *
 * Returns the document reference so callers can capture the id if needed.
 *
 * If you need to enqueue inside a `runTransaction(tx => ...)` callback,
 * use `enqueueOutboxEntryTx` instead.
 */
export function enqueueOutboxEntry(
  batch: FirebaseFirestore.WriteBatch,
  entry: Omit<
    NotificationOutboxEntry,
    "id" | "status" | "attempts" | "created_at" | "updated_at" | "next_attempt_at"
  >,
): FirebaseFirestore.DocumentReference {
  const ref = adminDb.collection("notification_outbox").doc();
  batch.set(ref, buildEntry(ref.id, entry));
  return ref;
}

/** Transaction variant for use inside `adminDb.runTransaction`. */
export function enqueueOutboxEntryTx(
  tx: FirebaseFirestore.Transaction,
  entry: Omit<
    NotificationOutboxEntry,
    "id" | "status" | "attempts" | "created_at" | "updated_at" | "next_attempt_at"
  >,
): FirebaseFirestore.DocumentReference {
  const ref = adminDb.collection("notification_outbox").doc();
  tx.set(ref, buildEntry(ref.id, entry));
  return ref;
}

function buildEntry(
  id: string,
  entry: Omit<
    NotificationOutboxEntry,
    "id" | "status" | "attempts" | "created_at" | "updated_at" | "next_attempt_at"
  >,
): NotificationOutboxEntry {
  const now = new Date().toISOString();
  return {
    id,
    status: "pending",
    attempts: 0,
    next_attempt_at: now,
    created_at: now,
    updated_at: now,
    ...entry,
  };
}

export const OUTBOX_DEFAULTS = {
  MAX_ATTEMPTS,
  /**
   * Exponential backoff with jitter. Returns the next-attempt-at ISO string.
   *   attempt 1 fail → +1 min
   *   attempt 2 fail → +5 min
   *   attempt 3 fail → +30 min
   *   attempt 4 fail → +2 hr
   *   attempt 5 fail → dead-letter
   */
  computeNextAttemptAt(attempts: number): string {
    const delays = [60, 300, 1800, 7200];
    const baseSeconds = delays[Math.min(attempts - 1, delays.length - 1)] ?? 7200;
    const jitter = Math.floor(Math.random() * Math.min(baseSeconds * 0.2, 600));
    const ms = (baseSeconds + jitter) * 1000;
    return new Date(Date.now() + ms).toISOString();
  },
};
