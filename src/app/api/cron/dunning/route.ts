/**
 * GET /api/cron/dunning
 *
 * Track C.6 — auto-downgrade after grace period.
 *
 * Stripe's payment_failed webhook (handled in /api/billing/webhook) sets
 * `payment_failed_at` on the church record. Stripe Smart Retries handles
 * automatic payment retries for ~7 days. After that grace window, we:
 *   1. Downgrade the church to free tier (so they don't get paid features
 *      while in arrears)
 *   2. Audit-log billing.subscription_canceled with reason="dunning_lapsed"
 *
 * If the payment recovers before the grace expires, the
 * invoice.payment_succeeded webhook clears `payment_failed_at` and this
 * cron sees nothing to do.
 *
 * Runs daily.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";

export const maxDuration = 300;

const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;

  const now = new Date();
  const cutoffIso = new Date(now.getTime() - GRACE_DAYS * DAY_MS).toISOString();

  // Find churches whose payment_failed_at is older than the grace window
  // AND who are still on a paid tier.
  const snap = await adminDb
    .collection("churches")
    .where("payment_failed_at", "<=", cutoffIso)
    .get();

  let downgraded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const tier = (data.subscription_tier as string) ?? "free";
    if (tier === "free") {
      skipped++;
      continue;
    }
    if (data.subscription_source === "manual") {
      // Respect manual tier overrides — don't auto-downgrade enterprise
      // accounts that the platform admin has set tier on directly.
      skipped++;
      continue;
    }

    try {
      await doc.ref.update({
        subscription_tier: "free",
        previous_tier: tier,
        tier_changed_at: now.toISOString(),
        // Don't clear payment_failed_at — keep it as audit context. The
        // webhook will clear it if a new successful payment comes through.
      });
      void audit({
        church_id: doc.id,
        actor: SYSTEM_ACTOR,
        action: "billing.subscription_canceled",
        target_type: "church",
        target_id: doc.id,
        metadata: {
          reason: "dunning_lapsed",
          from_tier: tier,
          payment_failed_at: data.payment_failed_at,
          grace_days: GRACE_DAYS,
        },
        outcome: "ok",
      });
      downgraded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    candidates: snap.docs.length,
    downgraded,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
