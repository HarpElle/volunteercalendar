/**
 * One-time backfill for Wave 2.2 (denormalize schedule.status onto assignments).
 *
 * Before the tightened firestore.rules deploys, every existing assignment
 * doc needs `schedule_status` populated — otherwise the new rule denies
 * volunteer reads of legacy data. This script walks every church → every
 * schedule → every child assignment and writes the missing field.
 *
 * Run order (Jason):
 *   1. PR for the denorm + writer changes lands (this script in tree)
 *   2. Run THIS script against production once: writes schedule_status to
 *      every existing assignment so they're all readable under the new rule
 *   3. Verify a sample read works
 *   4. Follow-up PR: tighten firestore.rules with the new check
 *
 * Doing them as two PRs (write-path-first, then rule-change) avoids a
 * window where the new rule is live but some pre-existing assignments
 * don't have the field yet.
 *
 * Usage:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-sa.json \
 *   FIREBASE_PROJECT_ID=volunteercalendar-mvp \
 *   npx tsx scripts/backfill-assignment-schedule-status.ts
 *
 * Idempotent: re-runs only update docs whose current schedule_status
 * doesn't match the parent schedule's status. Safe to re-run any time.
 *
 * Dry run: prefix with DRY_RUN=1 to print the planned writes without
 * executing them.
 */

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_LIMIT = 450; // Firestore 500 hard cap; leave headroom

function log(msg: string, fields?: Record<string, unknown>): void {
  // Plain console here — scripts/ is allowlisted in eslint.config.mjs
  // eslint-disable-next-line no-console
  console.log(`[backfill] ${msg}`, fields ?? "");
}

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
  const db = getFirestore();

  log(`Starting backfill (dry_run=${DRY_RUN})`);

  const churchesSnap = await db.collection("churches").get();
  log(`Found ${churchesSnap.size} churches`);

  let totalUpdated = 0;
  let totalAlreadyMatching = 0;
  let totalMissingSchedule = 0;
  let totalChurchesScanned = 0;

  for (const churchDoc of churchesSnap.docs) {
    totalChurchesScanned++;
    const churchId = churchDoc.id;
    const churchRef = db.collection("churches").doc(churchId);

    const schedulesSnap = await churchRef.collection("schedules").get();
    if (schedulesSnap.empty) {
      log(`Skipping church (no schedules)`, { church_id: churchId });
      continue;
    }

    // Build schedule_id → status map for this church
    const scheduleStatusById = new Map<string, string>();
    for (const s of schedulesSnap.docs) {
      const status = s.data().status as string | undefined;
      if (status) scheduleStatusById.set(s.id, status);
    }

    // Iterate assignments and find ones needing update
    const assignSnap = await churchRef.collection("assignments").get();
    log(`Church ${churchId}: ${schedulesSnap.size} schedules, ${assignSnap.size} assignments`);

    const toUpdate: { ref: FirebaseFirestore.DocumentReference; newStatus: string }[] = [];
    for (const a of assignSnap.docs) {
      const data = a.data();
      const parentScheduleId = data.schedule_id as string | undefined;
      const currentStatus = data.schedule_status as string | undefined;
      if (!parentScheduleId) {
        // Assignment with no parent — leaving alone (event-only, etc.)
        continue;
      }
      const parentStatus = scheduleStatusById.get(parentScheduleId);
      if (!parentStatus) {
        // Orphaned assignment — parent schedule was deleted. Skip; the
        // assignment is itself probably garbage. Surface as a separate
        // counter for visibility.
        totalMissingSchedule++;
        continue;
      }
      if (currentStatus === parentStatus) {
        totalAlreadyMatching++;
        continue;
      }
      toUpdate.push({ ref: a.ref, newStatus: parentStatus });
    }

    if (toUpdate.length === 0) {
      log(`Church ${churchId}: nothing to update`);
      continue;
    }

    log(`Church ${churchId}: ${toUpdate.length} assignments need update`);

    if (DRY_RUN) {
      for (const { ref, newStatus } of toUpdate.slice(0, 5)) {
        log(`  [dry-run] would set ${ref.path}.schedule_status = ${newStatus}`);
      }
      if (toUpdate.length > 5) {
        log(`  [dry-run] (... and ${toUpdate.length - 5} more)`);
      }
      totalUpdated += toUpdate.length;
      continue;
    }

    // Chunked batched writes
    for (let i = 0; i < toUpdate.length; i += BATCH_LIMIT) {
      const chunk = toUpdate.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const { ref, newStatus } of chunk) {
        batch.update(ref, { schedule_status: newStatus });
      }
      await batch.commit();
      totalUpdated += chunk.length;
    }
    log(`Church ${churchId}: wrote ${toUpdate.length} updates`);
  }

  log("Backfill complete", {
    dry_run: DRY_RUN,
    churches_scanned: totalChurchesScanned,
    assignments_updated: totalUpdated,
    assignments_already_matching: totalAlreadyMatching,
    assignments_with_missing_schedule: totalMissingSchedule,
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[backfill] FATAL:", err);
  process.exit(1);
});
