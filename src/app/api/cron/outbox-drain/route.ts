/**
 * GET /api/cron/outbox-drain
 *
 * Drains the notification_outbox: picks up pending entries whose
 * `next_attempt_at` is in the past, dispatches them via the appropriate
 * provider (Resend for email, Twilio for SMS), and marks them sent or
 * retries with exponential backoff. After 5 attempts the entry is
 * dead-lettered for human review.
 *
 * Designed to be safe to run frequently (every minute is reasonable). The
 * batch size cap keeps each invocation under Vercel's function timeout.
 *
 * Runs serially through the batch — order matters because Resend rate
 * limits per-second; we don't want to hammer the API with bursts.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import {
  type NotificationOutboxEntry,
  type OutboxEmailPayload,
  type OutboxSmsPayload,
  OUTBOX_DEFAULTS,
} from "@/lib/server/outbox";
import { Resend } from "resend";
import { sendSms } from "@/lib/services/sms";

export const maxDuration = 300;

const BATCH_SIZE = 50;

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;

  const now = new Date().toISOString();

  const snap = await adminDb
    .collection("notification_outbox")
    .where("status", "==", "pending")
    .where("next_attempt_at", "<=", now)
    .orderBy("next_attempt_at", "asc")
    .limit(BATCH_SIZE)
    .get();

  let sent = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const doc of snap.docs) {
    const entry = doc.data() as NotificationOutboxEntry;

    try {
      if (entry.kind === "email") {
        const p = entry.payload as OutboxEmailPayload;
        if (!process.env.RESEND_API_KEY) {
          throw new Error("RESEND_API_KEY not configured");
        }
        const result = await resend.emails.send({
          from: p.from || "VolunteerCal <noreply@harpelle.com>",
          replyTo: p.reply_to,
          to: [p.to],
          subject: p.subject,
          html: p.html,
          text: p.text,
        });
        if (result.error) {
          throw new Error(result.error.message ?? "Resend error");
        }
      } else if (entry.kind === "sms") {
        const p = entry.payload as OutboxSmsPayload;
        await sendSms({ to: p.to, body: p.body });
      } else {
        throw new Error(`Unknown outbox kind: ${entry.kind}`);
      }

      await doc.ref.update({
        status: "sent",
        attempts: entry.attempts + 1,
        updated_at: new Date().toISOString(),
        last_error: null,
      });
      sent++;
    } catch (err) {
      const attempts = entry.attempts + 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[outbox-drain] ${entry.id} (origin=${entry.origin}) attempt ${attempts} failed:`,
        errMsg,
      );

      if (attempts >= OUTBOX_DEFAULTS.MAX_ATTEMPTS) {
        await doc.ref.update({
          status: "dead_letter",
          attempts,
          last_error: errMsg.slice(0, 500),
          updated_at: new Date().toISOString(),
        });
        deadLettered++;
      } else {
        await doc.ref.update({
          status: "pending",
          attempts,
          last_error: errMsg.slice(0, 500),
          next_attempt_at: OUTBOX_DEFAULTS.computeNextAttemptAt(attempts),
          updated_at: new Date().toISOString(),
        });
        retried++;
      }
    }
  }

  return NextResponse.json({
    processed: snap.docs.length,
    sent,
    retried,
    dead_lettered: deadLettered,
  });
}
