/**
 * Wave 12 C — daily auto-escalation cron for unanswered swap requests.
 *
 * Sweeps every open swap_request across the platform once per day. If
 * the service is today or tomorrow AND no teammate has covered yet
 * AND we haven't already escalated, fire an email + in-app
 * notification to the team's schedulers and the org admins/owners so
 * they can step in before day-of becomes a crisis.
 *
 * Once-only per swap — the route stamps `escalated_at` on the swap
 * doc so subsequent daily runs skip it. Scheduler doesn't need a
 * second nag for the same swap.
 *
 * Schedule (vercel.json): daily at 12:00 UTC (~7am CT) so Saturday's
 * run lands the email for Sunday services at breakfast.
 *
 * Auth: standard CRON_SECRET via requireCronSecret. Telemetry via
 * withCronRun.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { withCronRun } from "@/lib/server/cron-runs";
import { getBaseUrl } from "@/lib/utils/base-url";
import { log } from "@/lib/log";
import { resend } from "@/lib/resend";
import { resolveSchedulerEligibility } from "@/lib/server/notification-eligibility";
import {
  shouldEscalateSwap,
  addOneDayIso,
} from "@/lib/server/swap-escalation";
import { buildSwapEscalationEmail } from "@/lib/utils/emails/swap-escalation";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";
import { createUserNotification } from "@/lib/services/user-notifications";
import type { SwapRequest } from "@/lib/types";

export const maxDuration = 300;

interface ChurchSlice {
  id: string;
  name: string;
  /** W11-C: public Firebase Storage URL of the church's uploaded
   *  logo, or null. Threaded into the escalation email when present. */
  logoUrl: string | null;
}

interface EscalationOutcome {
  swap_id: string;
  church_id: string;
  emails_sent: number;
  notifications_sent: number;
  recipient_count: number;
}

export async function GET(request: NextRequest) {
  const blocked = requireCronSecret(request);
  if (blocked) return blocked;

  const { response } = await withCronRun("swap-escalation", async () => {
    // Compute the date window ONCE up front so every swap in this run
    // is judged against the same "today" — avoids a swap landing on
    // the wrong side of the window because the cron took a few seconds.
    const todayIso = new Date().toISOString().slice(0, 10);
    const tomorrowIso = addOneDayIso(todayIso);

    // Pull every "open" swap across the platform via collectionGroup.
    // Filter to "today or tomorrow" in memory via shouldEscalateSwap.
    // Open-swap volume per org is small (typically <10 at any time;
    // platform-wide <50 even at our growth target), so a single-index
    // query is cheaper than maintaining a composite (status,
    // service_date) index. Trade-off worth revisiting if open-swap
    // backlog ever crosses a few hundred.
    const openSnap = await adminDb
      .collectionGroup("swap_requests")
      .where("status", "==", "open")
      .get();

    if (openSnap.empty) {
      return {
        response: NextResponse.json({
          success: true,
          message: "No open swap requests in window",
          escalated: [],
        }),
        summary: { processed: 0 },
      };
    }

    // Group swaps by church so we can fetch each church's metadata
    // (name, memberships) once instead of per-swap.
    const swapsByChurch = new Map<
      string,
      Array<{ ref: FirebaseFirestore.DocumentReference; swap: SwapRequest }>
    >();
    for (const doc of openSnap.docs) {
      const swap = { id: doc.id, ...doc.data() } as SwapRequest;
      if (!swapsByChurch.has(swap.church_id)) {
        swapsByChurch.set(swap.church_id, []);
      }
      swapsByChurch.get(swap.church_id)!.push({ ref: doc.ref, swap });
    }

    const origin = getBaseUrl(request);
    const outcomes: EscalationOutcome[] = [];

    for (const [churchId, swaps] of swapsByChurch) {
      // Per-church metadata — single fetches, reused across swaps.
      const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
      if (!churchSnap.exists) continue;
      const church: ChurchSlice = {
        id: churchId,
        name: (churchSnap.data()?.name as string) || "your church",
        logoUrl:
          (churchSnap.data()?.logo_url as string | null | undefined) ?? null,
      };

      // Pull active scheduler/admin/owner memberships once per church.
      // We filter per-swap by ministry_scope below; pulling the whole
      // set up front avoids N queries per church.
      const membershipsSnap = await adminDb
        .collection("memberships")
        .where("church_id", "==", churchId)
        .where("status", "==", "active")
        .get();

      for (const { ref: swapRef, swap } of swaps) {
        if (!shouldEscalateSwap({ swap, todayIso, tomorrowIso })) continue;

        // Resolve the team (ministry) + service names for the email.
        const [ministrySnap, serviceSnap] = await Promise.all([
          adminDb
            .doc(`churches/${churchId}/ministries/${swap.ministry_id}`)
            .get(),
          swap.service_id
            ? adminDb
                .doc(`churches/${churchId}/services/${swap.service_id}`)
                .get()
            : Promise.resolve(null),
        ]);
        const teamName =
          (ministrySnap.data()?.name as string) || "your team";
        const serviceName =
          (serviceSnap?.data()?.name as string) || "your service";

        // Recipients: admins + owners always, schedulers iff their
        // ministry_scope covers this swap's ministry (or is empty =
        // all-ministries-scope).
        const recipients = membershipsSnap.docs.filter((mDoc) => {
          const m = mDoc.data();
          const role = m.role as string;
          if (role === "admin" || role === "owner") return true;
          if (role === "scheduler") {
            const scope = (m.ministry_scope as string[]) || [];
            return scope.length === 0 || scope.includes(swap.ministry_id);
          }
          return false;
        });

        if (recipients.length === 0) {
          // Mark escalated anyway so we don't re-check daily forever.
          await swapRef.update({
            escalated_at: new Date().toISOString(),
          });
          outcomes.push({
            swap_id: swap.id,
            church_id: churchId,
            emails_sent: 0,
            notifications_sent: 0,
            recipient_count: 0,
          });
          continue;
        }

        const ctaUrl = `${origin}/dashboard/schedules`;

        let emailsSent = 0;
        let notifsSent = 0;

        for (const mDoc of recipients) {
          const m = mDoc.data();
          const userId = m.user_id as string;

          // Profile lookup for email + display name.
          const profileSnap = await adminDb.doc(`users/${userId}`).get();
          if (!profileSnap.exists) continue;
          const profile = profileSnap.data()!;
          const recipientEmail = (profile.email as string) || "";
          const recipientName =
            (profile.display_name as string) || "Scheduler";

          // Phase 2: scheduler-eligibility gate. Honors enabled_types
          // + channel routing + org-pause. Escalation is "swap_request"
          // in the SchedulerNotificationType taxonomy.
          const eligibility = await resolveSchedulerEligibility({
            churchId,
            userId,
            notificationType: "swap_request",
          });

          // 1. Email
          if (recipientEmail && eligibility.email) {
            try {
              const built = buildSwapEscalationEmail({
                recipientName,
                requesterName: swap.requester_name,
                churchName: church.name,
                churchLogoUrl: church.logoUrl,
                teamName,
                serviceName,
                serviceDate: swap.service_date,
                roleName: swap.role_title,
                note: swap.reason,
                ctaUrl,
              });
              await resend.emails.send({
                from: `${church.name} via VolunteerCal <noreply@harpelle.com>`,
                to: recipientEmail,
                subject: built.subject,
                html: built.html,
                text: built.text,
              });
              emailsSent++;
            } catch (err) {
              log.warn("swap-escalation: email send failed", {
                error: err,
                church_id: churchId,
                swap_id: swap.id,
                recipient: recipientEmail,
              });
            }
          }

          // 2. In-app notification (reuse swap_request type — the
          // scheduler's inbox already understands that surface).
          try {
            await createUserNotification({
              user_id: userId,
              church_id: churchId,
              type: "swap_request",
              title: `Open swap still uncovered: ${swap.role_title}`,
              body: `${swap.requester_name} needs a sub on ${swap.service_date} (${teamName}). No teammate has covered yet.`,
              metadata: {
                link_href: "/dashboard/schedules",
                swap_id: swap.id,
                // Carried as a string flag — UserNotification.metadata
                // is typed Record<string, string|null>. The future
                // inbox renderer can branch on this to label the row
                // "Escalated" instead of just "Sub needed".
                escalated: "true",
              },
            });
            notifsSent++;
          } catch (err) {
            log.warn("swap-escalation: in-app notification failed", {
              error: err,
              church_id: churchId,
              swap_id: swap.id,
              user_id: userId,
            });
          }
        }

        // Stamp escalated_at so we don't repeat tomorrow.
        await swapRef.update({
          escalated_at: new Date().toISOString(),
        });

        // Audit. Best-effort.
        void audit({
          church_id: churchId,
          actor: SYSTEM_ACTOR,
          action: "swap.escalated",
          target_type: "swap_request",
          target_id: swap.id,
          metadata: {
            ministry_id: swap.ministry_id,
            service_date: swap.service_date,
            recipient_count: recipients.length,
            emails_sent: emailsSent,
            notifications_sent: notifsSent,
          },
          outcome: "ok",
        });

        outcomes.push({
          swap_id: swap.id,
          church_id: churchId,
          emails_sent: emailsSent,
          notifications_sent: notifsSent,
          recipient_count: recipients.length,
        });
      }
    }

    return {
      response: NextResponse.json({
        success: true,
        escalated: outcomes,
        total_escalated: outcomes.length,
      }),
      summary: { processed: outcomes.length },
    };
  });

  return response;
}
