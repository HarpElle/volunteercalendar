/**
 * Idempotent backfill: delete auto-generated assignments left behind on
 * Self-Service drafts created before PR #27 (which made the generator
 * skip auto-assignment when workflow_mode === "self-service").
 *
 * Codex PR #29 retest 2026-05-18: the existing 2026-08-24 → 2026-08-30
 * Self-Service draft in TESTER — Codex 2 still rendered as a 3/3 assigned
 * matrix because three stale `signup_type: "scheduled"` assignments
 * survived the workflow-mode contract change. This script finds + deletes
 * those leftovers across every church.
 *
 * Safety rules:
 *  - Only touches schedules with status === "draft" (never approved/published).
 *  - Only deletes assignments with signup_type === "scheduled" (auto-generated).
 *    Anything with signup_type === "self_signup" — future volunteer-claimed
 *    assignments — is left alone.
 *  - Workflow_mode comparison uses normalizeWorkflowMode() so whitespace,
 *    underscore, and casing variants all collapse to "self-service".
 *  - Dry-run by default; pass --apply to write.
 *
 * Usage:
 *   tsx scripts/backfill-self-service-stale-assignments.ts          # dry-run
 *   tsx scripts/backfill-self-service-stale-assignments.ts --apply  # write
 */

import "dotenv/config";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeWorkflowMode } from "@/lib/services/scheduler";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Mode: ${apply ? "APPLY (will delete)" : "DRY-RUN (no writes)"}`);

  const churches = await adminDb.collection("churches").get();
  console.log(`Scanning ${churches.size} churches…\n`);

  let totalSelfServiceDrafts = 0;
  let totalStaleAssignments = 0;
  let totalDeleted = 0;

  for (const churchDoc of churches.docs) {
    const churchId = churchDoc.id;
    const churchName = churchDoc.data().name ?? "(unnamed)";
    const schedSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("schedules")
      .where("status", "==", "draft")
      .get();

    const selfServiceDrafts = schedSnap.docs.filter(
      (d) => normalizeWorkflowMode(d.data().workflow_mode) === "self-service",
    );
    if (selfServiceDrafts.length === 0) continue;

    totalSelfServiceDrafts += selfServiceDrafts.length;
    console.log(
      `${churchName} (${churchId.slice(0, 8)}…) — ${selfServiceDrafts.length} self-service draft(s)`,
    );

    for (const sched of selfServiceDrafts) {
      const sd = sched.data();
      const assignmentsSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("assignments")
        .where("schedule_id", "==", sched.id)
        .get();

      const stale = assignmentsSnap.docs.filter((a) => {
        const data = a.data();
        // Default to "scheduled" if missing (older docs were all auto-generated).
        const signupType = (data.signup_type as string | undefined) ?? "scheduled";
        return signupType === "scheduled";
      });

      console.log(
        `  ${sched.id.slice(0, 8)}…  ${sd.date_range_start}→${sd.date_range_end}  ` +
          `assignments=${assignmentsSnap.size}  stale=${stale.length}`,
      );

      totalStaleAssignments += stale.length;

      if (apply && stale.length > 0) {
        // Batch deletes (500 limit) — overkill for a handful but keeps the
        // pattern safe for any future scale.
        for (let i = 0; i < stale.length; i += 500) {
          const batch = adminDb.batch();
          for (const docSnap of stale.slice(i, i + 500)) {
            batch.delete(docSnap.ref);
          }
          await batch.commit();
        }
        totalDeleted += stale.length;
        console.log(`    → deleted ${stale.length}`);
      } else if (stale.length > 0) {
        for (const docSnap of stale) {
          const d = docSnap.data();
          console.log(
            `    would delete ${docSnap.id.slice(0, 8)}…  ${d.service_date} · ${d.role_title} · ${d.volunteer_id?.slice(0, 8) ?? "?"}…`,
          );
        }
      }
    }
  }

  console.log(
    `\nSummary: ${totalSelfServiceDrafts} self-service draft(s), ` +
      `${totalStaleAssignments} stale auto-assignment(s)` +
      (apply ? ` — deleted ${totalDeleted}` : " — dry-run, nothing written"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
