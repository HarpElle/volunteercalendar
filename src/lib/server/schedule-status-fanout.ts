/**
 * Schedule-status denormalization fan-out (Wave 2.2).
 *
 * When a schedule transitions status (draft → approved → published →
 * archived), the new value is denormalized onto every child assignment
 * doc's `schedule_status` field. This is what lets the Firestore rule
 * enforce volunteer-vs-draft visibility without an inline `get()` (which
 * Firestore's list-query rule engine rejects — Pass G Codex Round 1
 * burned us on that).
 *
 * Why a helper instead of inlining: there are three status-change paths
 * today (publish, approve-finalize, and the eventual archive cron). All
 * three must call this. Centralizing the batched-write makes it harder
 * to miss one in a future change.
 *
 * Batch sizing: Firestore caps writes at 500 per batch. We chunk to
 * stay under the cap. A typical schedule has 30–200 assignments — one
 * batch usually suffices.
 */

import { adminDb } from "@/lib/firebase/admin";
import { log } from "@/lib/log";
import type { ScheduleStatus } from "@/lib/types";

const BATCH_LIMIT = 450; // 500 hard cap; leave headroom for retries

/**
 * Set `schedule_status = newStatus` on every assignment doc with
 * `schedule_id == scheduleId` under the given church. Returns the count
 * of docs updated.
 *
 * Idempotent — calling twice with the same status writes the same value
 * each time.
 */
export async function fanOutScheduleStatus(
  churchId: string,
  scheduleId: string,
  newStatus: ScheduleStatus,
): Promise<{ updated: number }> {
  const assignSnap = await adminDb
    .collection(`churches/${churchId}/assignments`)
    .where("schedule_id", "==", scheduleId)
    .get();

  if (assignSnap.empty) {
    return { updated: 0 };
  }

  let updated = 0;
  for (let i = 0; i < assignSnap.docs.length; i += BATCH_LIMIT) {
    const chunk = assignSnap.docs.slice(i, i + BATCH_LIMIT);
    const batch = adminDb.batch();
    for (const doc of chunk) {
      batch.update(doc.ref, { schedule_status: newStatus });
    }
    try {
      await batch.commit();
      updated += chunk.length;
    } catch (err) {
      log.error("schedule-status fan-out batch failed", {
        error: err,
        church_id: churchId,
        schedule_id: scheduleId,
        new_status: newStatus,
        chunk_size: chunk.length,
        chunk_start: i,
      });
      throw err;
    }
  }

  return { updated };
}
