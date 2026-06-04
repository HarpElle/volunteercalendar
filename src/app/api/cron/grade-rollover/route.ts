/**
 * GET /api/cron/grade-rollover
 *
 * Daily cron. On the 1st of each month, advances children's grades
 * for any church whose settings.grade_rollover policy matches the
 * current month:
 *   - "june"      → fires June 1
 *   - "august"    → fires August 1
 *   - "september" → fires September 1
 *   - "manual"    → never fires (default — staff manages by hand)
 *
 * For each matching church:
 *   - Loads all active children (person_type="child", status="active")
 *   - Skips any whose updated_at is within the last 60 days (avoids
 *     stomping recent parent edits via the Family Portal self-service)
 *   - Advances each by one grade in the standard progression
 *   - 6th-graders get status="inactive" with a "graduated" audit
 *
 * Auth: standard CRON_SECRET via requireCronSecret. Telemetry via
 * the audit table — one summary entry per org actually advanced,
 * so the count of affected kids is queryable.
 *
 * The check runs daily (cheap) so we don't need a separate monthly
 * scheduler; the day-of-month gate inside the handler does the
 * actual fan-out filtering.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";
import {
  nextGradeAfterRollover,
  shouldAdvanceChild,
  shouldRunRolloverForOrg,
} from "@/lib/server/grade-rollover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;

  const now = new Date();
  try {
    // Pull every church doc. Day-of-month gate inside shouldRunRolloverForOrg
    // means most days nothing fires; we only iterate churches to read
    // their grade_rollover policy.
    const churchesSnap = await adminDb.collection("churches").get();

    const orgsProcessed: Array<{
      church_id: string;
      church_name: string;
      advanced: number;
      graduated: number;
      skipped_recent: number;
    }> = [];

    for (const churchDoc of churchesSnap.docs) {
      const churchData = churchDoc.data();
      const churchName = (churchData.name as string) || "Unknown";
      const policy = (
        churchData.settings as
          | {
              grade_rollover?: "manual" | "june" | "august" | "september";
            }
          | undefined
      )?.grade_rollover;

      if (!shouldRunRolloverForOrg(policy, now)) continue;

      // This org's rollover fires today.
      const churchRef = churchDoc.ref;
      const childrenSnap = await churchRef
        .collection("people")
        .where("person_type", "==", "child")
        .where("status", "==", "active")
        .get();

      let advanced = 0;
      let graduated = 0;
      let skippedRecent = 0;

      // Batched updates — Firestore caps at 500 ops per batch. For
      // any realistic church (<5000 kids) we'll fit in one or two.
      let batch = adminDb.batch();
      let batchOps = 0;
      const flushIfFull = async () => {
        if (batchOps >= 450) {
          await batch.commit();
          batch = adminDb.batch();
          batchOps = 0;
        }
      };

      for (const childDoc of childrenSnap.docs) {
        const data = childDoc.data();
        const cp = (data.child_profile as Record<string, unknown>) ?? {};
        const updatedAt = data.updated_at as string | undefined;

        if (!shouldAdvanceChild({ updated_at: updatedAt, now })) {
          skippedRecent++;
          continue;
        }

        const next = nextGradeAfterRollover(cp.grade as string | null);
        if (next === null) continue; // no grade set / unknown grade

        const nowIso = now.toISOString();
        const updates: Record<string, unknown> = {
          updated_at: nowIso,
        };
        if (next === "graduate") {
          updates.status = "inactive";
          // Stamp the reason on the doc so an admin who looks at the
          // archived child knows WHY they were archived.
          updates.archived_reason = "graduated";
          updates.archived_at = nowIso;
          graduated++;
        } else {
          updates["child_profile.grade"] = next;
          advanced++;
        }

        batch.update(childDoc.ref, updates);
        batchOps++;
        await flushIfFull();
      }

      if (batchOps > 0) {
        await batch.commit();
      }

      if (advanced > 0 || graduated > 0 || skippedRecent > 0) {
        orgsProcessed.push({
          church_id: churchDoc.id,
          church_name: churchName,
          advanced,
          graduated,
          skipped_recent: skippedRecent,
        });

        void audit({
          church_id: churchDoc.id,
          actor: SYSTEM_ACTOR,
          action: "checkin.grade_rollover_ran",
          target_type: "church",
          target_id: churchDoc.id,
          metadata: {
            policy,
            advanced,
            graduated,
            skipped_recent: skippedRecent,
            ran_at: now.toISOString(),
          },
          outcome: "ok",
        });
      }
    }

    return NextResponse.json({
      ran_at: now.toISOString(),
      churches_processed: orgsProcessed.length,
      churches: orgsProcessed,
    });
  } catch (error) {
    console.error("[GET /api/cron/grade-rollover]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
