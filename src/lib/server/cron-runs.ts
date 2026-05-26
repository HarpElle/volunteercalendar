/**
 * Cron run visibility (Wave 2.3).
 *
 * Wraps each cron route's main body so every invocation writes a row to the
 * top-level `cron_runs` collection. The platform admin "Cron Runs" page
 * surfaces the last 7 days so we can spot missed runs, slow runs, and
 * failure spikes without trawling Vercel logs.
 *
 * Doc shape (one per run):
 *   cron_runs/{cron_name}_{started_at_iso_safe}
 *     {
 *       cron_name: "stats-refresh",
 *       started_at: "2026-05-26T03:00:00.000Z",
 *       completed_at: "2026-05-26T03:01:14.812Z" | null,
 *       status: "running" | "ok" | "failed",
 *       duration_ms: 74812 | null,
 *       processed: 14 | null,
 *       failed: 0 | null,
 *       error_message: "..." | null,
 *       metadata: { ... } | null,
 *     }
 *
 * Auth: docs are written via Admin SDK. Client reads are denied by Firestore
 * rules; the admin page goes through `/api/platform/cron-runs` which checks
 * `isPlatformAdmin`.
 */

import { adminDb } from "@/lib/firebase/admin";
import { log } from "@/lib/log";
import type { NextResponse } from "next/server";

export interface CronRunSummary {
  /** Number of items the cron processed successfully. */
  processed?: number;
  /** Number of items that failed inside this run (route-defined). */
  failed?: number;
  /** Optional small JSON blob for run-specific detail (counts per church, etc.). */
  metadata?: Record<string, unknown>;
}

/** Convert ISO timestamp into a safe Firestore doc-id segment. */
function tsForId(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

/**
 * Wrap a cron's main body. Writes a `running` marker before, updates to
 * `ok` or `failed` after. Re-throws so the route handler returns the same
 * 500/200 it always did.
 *
 * Failures inside the cron_runs write itself never block the cron: we
 * catch + log so an outage of the marker doesn't make the cron itself
 * appear broken.
 *
 * Usage:
 *
 *   export async function GET(req: NextRequest) {
 *     const blocked = requireCronSecret(req);
 *     if (blocked) return blocked;
 *     return await withCronRun("notification-cleanup", async () => {
 *       // ... existing logic ...
 *       return NextResponse.json({ deleted });
 *       // Optionally return the summary too — extracted from the response
 *       // is fine, but easier to compute here and return both:
 *     }).then(({ response }) => response);
 *   }
 *
 * Since cron routes return NextResponse, the wrapper signature accepts a
 * function returning `{ response, summary? }` so the route can both ship
 * its HTTP response AND surface counts to the marker.
 */
// R is always NextResponse in practice. We narrow at the API to avoid
// TypeScript inferring per-branch shapes inside the callsite (which would
// reject any caller whose first branch returns a narrower JSON body than
// the second). The cron route always wraps with NextResponse.json so
// loosening to the unparametrized NextResponse type is correct.
type CronResponse = NextResponse;

export async function withCronRun(
  cronName: string,
  fn: () => Promise<{ response: CronResponse; summary?: CronRunSummary }>,
): Promise<{ response: CronResponse }> {
  const startedAt = new Date();
  const docId = `${cronName}_${tsForId(startedAt)}`;
  const ref = adminDb.doc(`cron_runs/${docId}`);

  // Write the "running" marker. Don't block on failure here — if the
  // marker doc can't be written we still want the cron to do its job.
  try {
    await ref.set({
      cron_name: cronName,
      started_at: startedAt.toISOString(),
      completed_at: null,
      status: "running",
    });
  } catch (err) {
    log.warn("cron_runs initial marker write failed", {
      error: err,
      cron_name: cronName,
    });
  }

  try {
    const result = await fn();
    const completedAt = new Date();
    try {
      await ref.update({
        completed_at: completedAt.toISOString(),
        status: "ok",
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        processed: result.summary?.processed ?? null,
        failed: result.summary?.failed ?? null,
        metadata: result.summary?.metadata ?? null,
      });
    } catch (err) {
      log.warn("cron_runs completion marker write failed", {
        error: err,
        cron_name: cronName,
      });
    }
    return { response: result.response };
  } catch (err) {
    const completedAt = new Date();
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      await ref.update({
        completed_at: completedAt.toISOString(),
        status: "failed",
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        error_message: errMsg.slice(0, 1000),
      });
    } catch (writeErr) {
      log.warn("cron_runs failure marker write failed", {
        error: writeErr,
        cron_name: cronName,
      });
    }
    // Re-throw so the route's existing try/catch surfaces the 500 to the
    // cron caller. Sentry already gets the original error via log.error in
    // the route handler.
    throw err;
  }
}
