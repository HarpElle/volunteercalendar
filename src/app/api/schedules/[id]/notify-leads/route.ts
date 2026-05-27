/**
 * POST /api/schedules/[id]/notify-leads
 *
 * Wave 4.3 — replaces the broken "Request Approval" button stub on the
 * Schedules approval UI. Sends a templated approval-request email to every
 * ministry lead whose team has assignments in this schedule.
 *
 * Body:
 *   { church_id: string }
 *
 * Returns:
 *   { success: true, sent: number, skipped: number, ministries: number }
 *
 * Behaviour notes:
 *   - Emails go through the existing notification_outbox so a Resend outage
 *     during the click doesn't lose the notifications — the cron drain
 *     redelivers when Resend recovers.
 *   - Only ministries with `lead_email` set are notified. Ministries with
 *     a `lead_user_id` but no `lead_email` are counted as skipped (the UI
 *     can surface this to nudge admins to fill in the lead's email).
 *   - The schedule must be in `in_review` status (or `draft`, which is
 *     the state right before "Send for Review" runs). Anything else returns
 *     400. This prevents accidentally pinging leads about an already-
 *     published schedule.
 *   - Tier-gated to growth+ — multi-stage approval is a Growth feature.
 *   - Auth: admin/owner only (matches the visibility of the button).
 *   - Audit: emits `schedule.notify_leads` once per call with the count.
 *   - Rate-limited per (user, schedule) at 6/hour to keep accidental
 *     double-clicks + impatient retries from spamming leads.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertBearerToken, requireMembership } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { audit, userActor } from "@/lib/server/audit";
import { enqueueOutboxEntry, type OutboxEmailPayload } from "@/lib/server/outbox";
import { buildApprovalRequestEmail } from "@/lib/utils/emails/approval-request";
import { getBaseUrl } from "@/lib/utils/base-url";
import { TIER_LIMITS } from "@/lib/constants";
import { log } from "@/lib/log";
import type { Ministry, Schedule, SubscriptionTier } from "@/lib/types";

const BodySchema = z.object({
  church_id: z.string().min(1),
});

function formatCoveragePeriod(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const monthOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { year: "numeric" };
  if (sameMonth) {
    return `${s.toLocaleDateString("en-US", monthOpts)} – ${e.toLocaleDateString("en-US", { day: "numeric" })}, ${s.toLocaleDateString("en-US", yearOpts)}`;
  }
  return `${s.toLocaleDateString("en-US", monthOpts)} – ${e.toLocaleDateString("en-US", { ...monthOpts, ...yearOpts })}`;
}

function formatTargetDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, BodySchema);
  if (body instanceof NextResponse) return body;

  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;

  const { id: scheduleId } = await params;
  const { church_id } = body;

  // Per-(user, schedule) rate limit. Catches accidental double-clicks AND
  // an impatient admin spamming leads when they don't get an instant reply.
  const limited = await rateLimitDistributed(req, {
    prefix: "schedule-notify-leads",
    limit: 6,
    windowSeconds: 60 * 60,
    extraKey: `${auth.uid}:${scheduleId}`,
  });
  if (limited) return limited;

  try {
    const churchRef = adminDb.collection("churches").doc(church_id);

    // Tier gate — multi-stage approval lives behind Growth+. Mirrors the
    // UI gate at `requireMinistryApproval && status === "in_review"` so a
    // Free/Starter caller can't trigger an out-of-band notify via curl.
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const churchData = churchSnap.data() ?? {};
    const tier = (churchData.subscription_tier as SubscriptionTier) || "free";
    const tierLimits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    if (!tierLimits.multi_stage_approval) {
      return NextResponse.json(
        {
          error:
            "Per-team approval workflow requires the Growth plan or higher.",
          required_tier: "growth",
        },
        { status: 403 },
      );
    }

    // Load the schedule
    const scheduleRef = churchRef.collection("schedules").doc(scheduleId);
    const scheduleSnap = await scheduleRef.get();
    if (!scheduleSnap.exists) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    const schedule = { id: scheduleSnap.id, ...scheduleSnap.data() } as Schedule;

    if (!["in_review", "draft"].includes(schedule.status)) {
      return NextResponse.json(
        {
          error: `Cannot notify leads when schedule is "${schedule.status}". Move it to in_review first.`,
        },
        { status: 400 },
      );
    }

    // Resolve which ministries to notify. Prefer the schedule's explicit
    // `ministry_ids` scope (set when the schedule was generated for a
    // subset of teams). Fall back to the full ministry list — that's the
    // legacy behaviour for schedules created before `ministry_ids` was a
    // field.
    const ministriesSnap = await churchRef.collection("ministries").get();
    const allMinistries = ministriesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Ministry,
    );
    const scopedMinistries =
      schedule.ministry_ids && schedule.ministry_ids.length > 0
        ? allMinistries.filter((m) => schedule.ministry_ids!.includes(m.id))
        : allMinistries;

    const churchName = (churchData.name as string) || "your organization";
    const coveragePeriod = formatCoveragePeriod(
      schedule.date_range_start,
      schedule.date_range_end,
    );
    const targetDateRaw = schedule.approval_workflow?.target_approval_date ?? null;
    const targetDate = targetDateRaw ? formatTargetDate(targetDateRaw) : null;

    const baseUrl = getBaseUrl(req);
    // Deep link to the in-review schedule so leads land on the right view.
    const reviewUrl = `${baseUrl}/dashboard/schedules?schedule=${encodeURIComponent(scheduleId)}`;

    // Pre-resolve lead names from the People collection (lead_user_id →
    // Person.name via user_id). Falls back to the email's local-part or
    // "Team lead" if no name found.
    const leadUids = scopedMinistries
      .map((m) => m.lead_user_id)
      .filter((u): u is string => !!u);
    const nameByUid = new Map<string, string>();
    if (leadUids.length > 0) {
      const peopleSnap = await churchRef
        .collection("people")
        .where("user_id", "in", leadUids.slice(0, 30))
        .get();
      for (const doc of peopleSnap.docs) {
        const data = doc.data();
        if (data.user_id && data.name) {
          nameByUid.set(data.user_id as string, data.name as string);
        }
      }
    }

    // Build outbox entries inside a single WriteBatch so all-or-nothing
    // — if Firestore rejects the batch, nothing was enqueued and the
    // user can safely retry.
    const batch = adminDb.batch();
    let queued = 0;
    let skipped = 0;
    const skippedReasons: { ministry_id: string; reason: string }[] = [];

    for (const m of scopedMinistries) {
      const email = (m.lead_email || "").trim();
      if (!email) {
        skipped++;
        skippedReasons.push({ ministry_id: m.id, reason: "no_lead_email" });
        continue;
      }
      const leaderName =
        (m.lead_user_id && nameByUid.get(m.lead_user_id)) ||
        email.split("@")[0] ||
        "Team lead";

      const content = buildApprovalRequestEmail({
        leaderName,
        churchName,
        ministryName: m.name,
        coveragePeriod,
        targetDate,
        reviewUrl,
      });

      const payload: OutboxEmailPayload = {
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
        reply_to: "info@volunteercal.com",
      };

      enqueueOutboxEntry(batch, {
        church_id,
        kind: "email",
        origin: "schedule.notify_leads",
        payload,
        source_ref: `churches/${church_id}/schedules/${scheduleId}`,
      });
      queued++;
    }

    await batch.commit();

    // Wave 4.1 carry-over: this is a sensitive org-wide notification
    // (admins reaching out to N volunteer leads). One audit row per call,
    // not per email — keeps the Activity feed scannable.
    void audit({
      church_id,
      actor: userActor(auth.uid),
      action: "schedule.notify_leads",
      target_type: "schedule",
      target_id: scheduleId,
      metadata: {
        ministries_in_scope: scopedMinistries.length,
        emails_queued: queued,
        skipped,
        skipped_reasons: skippedReasons,
        coverage_period: coveragePeriod,
        target_date: targetDateRaw,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      success: true,
      sent: queued,
      skipped,
      ministries: scopedMinistries.length,
      ...(skipped > 0 ? { skipped_reasons: skippedReasons } : {}),
    });
  } catch (error) {
    log.error("[POST /api/schedules/[id]/notify-leads]", { error, scheduleId, church_id });
    return NextResponse.json(
      { error: "Failed to notify ministry leads" },
      { status: 500 },
    );
  }
}
