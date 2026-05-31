import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { buildExpiryWarningEmail } from "@/lib/utils/emails/prerequisite-expiry-warning";
import { buildPrerequisiteNudgeEmail } from "@/lib/utils/emails/prerequisite-nudge";
import { buildBackgroundCheckExpiryEmail } from "@/lib/utils/emails/background-check-expiry";
import type { OnboardingStep, VolunteerJourneyStep } from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import { resolveUserId, createUserNotification } from "@/lib/services/user-notifications";
import { resend } from "@/lib/resend";
import { log } from "@/lib/log";
import { withCronRun } from "@/lib/server/cron-runs";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";

export const maxDuration = 300;

/** How many days before expiry to send the warning. */
const EXPIRY_WARNING_DAYS = 30;
/** How many days of "in_progress" before sending a nudge. */
const STALLED_DAYS = 30;
/**
 * Wave 9 P0-3 sub-PR D: how many days before raw `background_check.
 * expires_at` to send the bg-check renewal warning. Distinct from
 * EXPIRY_WARNING_DAYS only so the two cadences can be tuned
 * independently in the future.
 */
const BG_CHECK_WARNING_DAYS = 30;

/**
 * GET /api/cron/prerequisite-check
 *
 * Daily cron job. For each church:
 *   1. Finds volunteer journey steps with approaching expiry → sends warning email
 *   2. Finds volunteers with stalled in_progress status → sends nudge email
 */
export async function GET(request: NextRequest) {
  const blocked = requireCronSecret(request);
  if (blocked) return blocked;

  try {
    const { response } = await withCronRun("prerequisite-check", async () => {
    const churchesSnap = await adminDb.collection("churches").get();
    if (churchesSnap.empty) {
      return {
        response: NextResponse.json({ success: true, message: "No churches", results: [] }),
        summary: { processed: 0 },
      };
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const warningCutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86400000)
      .toISOString()
      .slice(0, 10);

    const results: {
      church_id: string;
      church_name: string;
      expiry_warnings: number;
      nudges: number;
      /** Wave 9 P0-3 sub-PR D: raw bg-check expiry counters. */
      bg_check_warnings: number;
      bg_check_auto_expired: number;
      errors: string[];
    }[] = [];

    const bgWarningCutoff = new Date(
      now.getTime() + BG_CHECK_WARNING_DAYS * 86400000,
    )
      .toISOString()
      .slice(0, 10);

    for (const churchDoc of churchesSnap.docs) {
      const churchId = churchDoc.id;
      const churchName = (churchDoc.data().name as string) || churchId;
      const orgPrereqs = (churchDoc.data().org_prerequisites as OnboardingStep[]) || [];

      let expiryWarnings = 0;
      let nudges = 0;
      let bgCheckWarnings = 0;
      let bgCheckAutoExpired = 0;
      const errors: string[] = [];

      // Fetch ministries for prereqs + names
      const ministriesSnap = await adminDb.collection(`churches/${churchId}/ministries`).get();
      const ministryMap = new Map<string, { name: string; prerequisites: OnboardingStep[] }>();
      for (const mDoc of ministriesSnap.docs) {
        ministryMap.set(mDoc.id, {
          name: (mDoc.data().name as string) || "Ministry",
          prerequisites: (mDoc.data().prerequisites as OnboardingStep[]) || [],
        });
      }

      // Add org-wide prereqs
      if (orgPrereqs.length > 0) {
        ministryMap.set(ORG_WIDE_MINISTRY_ID, {
          name: "Organization",
          prerequisites: orgPrereqs,
        });
      }

      // Fetch all volunteers
      const volunteersSnap = await adminDb.collection(`churches/${churchId}/people`).where("is_volunteer", "==", true).get();

      for (const volDoc of volunteersSnap.docs) {
        const volData = volDoc.data();
        const volunteerName = (volData.name as string) || "Volunteer";
        const volunteerEmail = volData.email as string;
        if (!volunteerEmail) continue;

        const journey = (volData.volunteer_journey as VolunteerJourneyStep[]) || [];
        if (journey.length === 0) continue;

        // Check each journey step
        for (const step of journey) {
          const ministry = ministryMap.get(step.ministry_id);
          if (!ministry) continue;

          const prereq = ministry.prerequisites.find((p) => p.id === step.step_id);
          if (!prereq) continue;

          // 1. Expiry warning: completed steps with expires_at within warning window
          if (
            step.status === "completed" &&
            step.expires_at &&
            step.expires_at >= todayStr &&
            step.expires_at <= warningCutoff
          ) {
            const expiryDate = new Date(step.expires_at + "T12:00:00");
            const daysRemaining = Math.ceil(
              (expiryDate.getTime() - now.getTime()) / 86400000,
            );

            try {
              const { subject, html, text } = buildExpiryWarningEmail({
                volunteerName,
                churchName,
                stepLabel: prereq.label,
                ministryName: ministry.name,
                expiresAt: step.expires_at,
                daysRemaining,
                dashboardUrl: "https://volunteercal.com/dashboard/my-journey",
              });

              await resend.emails.send({
                from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
                to: volunteerEmail,
                subject,
                html,
                text,
              });
              expiryWarnings++;

              // Fire-and-forget: in-app expiry warning notification
              try {
                const volUserId = await resolveUserId(churchId, volDoc.id);
                if (volUserId) {
                  await createUserNotification({
                    user_id: volUserId,
                    church_id: churchId,
                    type: "prerequisite_expiry",
                    title: `Your ${prereq.label} expires soon`,
                    body: `Expires in ${daysRemaining} days`,
                    metadata: { link_href: "/dashboard/my-journey" },
                  });
                }
              } catch (notifErr) {
                log.error("Expiry warning user notification failed", { error: notifErr });
              }
            } catch (err) {
              errors.push(`expiry warning to ${volunteerEmail}: ${(err as Error).message}`);
            }
          }

          // 2. Stalled nudge: in_progress for more than STALLED_DAYS
          if (step.status === "in_progress" && step.completed_at) {
            // completed_at here means "started_at" for in_progress — reuse the field
            // as the timestamp when status changed to in_progress
            const startedDate = new Date(step.completed_at);
            const daysSinceStart = Math.floor(
              (now.getTime() - startedDate.getTime()) / 86400000,
            );

            if (daysSinceStart >= STALLED_DAYS) {
              // Only nudge once per 30-day period (check modulo)
              if (daysSinceStart % STALLED_DAYS !== 0) continue;

              const ministrySteps = journey.filter((s) => s.ministry_id === step.ministry_id);
              const completedCount = ministrySteps.filter(
                (s) => s.status === "completed" || s.status === "waived",
              ).length;
              const totalCount = ministry.prerequisites.length;

              try {
                const { subject, html, text } = buildPrerequisiteNudgeEmail({
                  volunteerName,
                  churchName,
                  ministryName: ministry.name,
                  stepsRemaining: totalCount - completedCount,
                  totalSteps: totalCount,
                  dashboardUrl: "https://volunteercal.com/dashboard/my-journey",
                });

                await resend.emails.send({
                  from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
                  to: volunteerEmail,
                  subject,
                  html,
                  text,
                });
                nudges++;

                // Fire-and-forget: in-app nudge notification
                try {
                  const volUserId = await resolveUserId(churchId, volDoc.id);
                  if (volUserId) {
                    await createUserNotification({
                      user_id: volUserId,
                      church_id: churchId,
                      type: "prerequisite_expiry",
                      title: `Reminder: Complete your ${prereq.label}`,
                      body: `You have ${totalCount - completedCount} steps left`,
                      metadata: { link_href: "/dashboard/my-journey" },
                    });
                  }
                } catch (notifErr) {
                  log.error("Prerequisite nudge user notification failed", { error: notifErr });
                }
              } catch (err) {
                errors.push(`nudge to ${volunteerEmail}: ${(err as Error).message}`);
              }
            }
          }
        }
      }

      // ────────────────────────────────────────────────────────────
      // Wave 9 P0-3 sub-PR D: raw bg-check expiry pass.
      //
      // Independent of the journey-step loop above because raw
      // `background_check.expires_at` lives on the Person doc, not
      // on `volunteer_journey[]`. We process every active volunteer
      // whose bg-check has an `expires_at`:
      //
      //   1. If today >= expires_at AND status === "cleared":
      //      auto-mark "expired", emit
      //      `volunteer.background_check_expired_auto`, send the
      //      "expired" variant email + an in-app notification.
      //
      //   2. Else if within BG_CHECK_WARNING_DAYS of expires_at
      //      AND the most recent warning wasn't sent for the SAME
      //      `expires_at` value: send the approaching-expiry
      //      warning email + in-app notification, then cache
      //      `expiry_warning_sent_for: expires_at`. If admin
      //      renews and bumps expires_at, the cache becomes stale
      //      automatically and the next pass re-warns.
      // ────────────────────────────────────────────────────────────
      for (const volDoc of volunteersSnap.docs) {
        const volData = volDoc.data();
        if (volData.status === "archived") continue;
        const bg = volData.background_check as
          | {
              status?: string;
              expires_at?: string | null;
              expiry_warning_sent_for?: string | null;
            }
          | null
          | undefined;
        if (!bg?.expires_at) continue;

        const volunteerName = (volData.name as string) || "Volunteer";
        const volunteerEmail = volData.email as string;
        const personRef = adminDb.doc(
          `churches/${churchId}/people/${volDoc.id}`,
        );

        // Case 1 — auto-expire
        if (bg.expires_at < todayStr && bg.status === "cleared") {
          try {
            await personRef.update({
              "background_check.status": "expired",
              updated_at: new Date().toISOString(),
            });
            bgCheckAutoExpired++;
            void audit({
              church_id: churchId,
              actor: SYSTEM_ACTOR,
              action: "volunteer.background_check_expired_auto",
              target_type: "person",
              target_id: volDoc.id,
              metadata: { expires_at: bg.expires_at },
              outcome: "ok",
            });

            // Send "expired" email + in-app, fire-and-forget.
            if (volunteerEmail) {
              const daysPast = -Math.ceil(
                (new Date(bg.expires_at + "T12:00:00").getTime() -
                  now.getTime()) /
                  86400000,
              );
              const { subject, html, text } = buildBackgroundCheckExpiryEmail({
                volunteerName,
                churchName,
                expiresAt: bg.expires_at,
                daysRemaining: -daysPast,
                variant: "expired",
                dashboardUrl: "https://volunteercal.com/dashboard/my-journey",
              });
              try {
                await resend.emails.send({
                  from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
                  to: volunteerEmail,
                  subject,
                  html,
                  text,
                });
              } catch (err) {
                errors.push(
                  `bg-check expired email to ${volunteerEmail}: ${(err as Error).message}`,
                );
              }
            }
            try {
              const volUserId = await resolveUserId(churchId, volDoc.id);
              if (volUserId) {
                await createUserNotification({
                  user_id: volUserId,
                  church_id: churchId,
                  type: "prerequisite_expiry",
                  title: "Your background check has expired",
                  body: "Renew it to stay eligible for scheduled assignments.",
                  metadata: { link_href: "/dashboard/my-journey" },
                });
              }
            } catch (notifErr) {
              log.error("bg-check expired user notification failed", {
                error: notifErr,
              });
            }
          } catch (err) {
            errors.push(
              `bg-check auto-expire for ${volDoc.id}: ${(err as Error).message}`,
            );
          }
          continue;
        }

        // Case 2 — approaching-expiry warning. Skip if outside the
        // warning window OR we've already warned for this exact
        // expires_at value.
        if (
          bg.expires_at >= todayStr &&
          bg.expires_at <= bgWarningCutoff &&
          bg.expiry_warning_sent_for !== bg.expires_at
        ) {
          if (!volunteerEmail) continue;
          const daysRemaining = Math.ceil(
            (new Date(bg.expires_at + "T12:00:00").getTime() -
              now.getTime()) /
              86400000,
          );
          try {
            const { subject, html, text } = buildBackgroundCheckExpiryEmail({
              volunteerName,
              churchName,
              expiresAt: bg.expires_at,
              daysRemaining,
              variant: "approaching",
              dashboardUrl: "https://volunteercal.com/dashboard/my-journey",
            });
            await resend.emails.send({
              from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
              to: volunteerEmail,
              subject,
              html,
              text,
            });
            bgCheckWarnings++;
            await personRef.update({
              "background_check.expiry_warning_sent_for": bg.expires_at,
              "background_check.expiry_warning_sent_at":
                new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            try {
              const volUserId = await resolveUserId(churchId, volDoc.id);
              if (volUserId) {
                await createUserNotification({
                  user_id: volUserId,
                  church_id: churchId,
                  type: "prerequisite_expiry",
                  title: "Your background check expires soon",
                  body: `Expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
                  metadata: { link_href: "/dashboard/my-journey" },
                });
              }
            } catch (notifErr) {
              log.error("bg-check warning user notification failed", {
                error: notifErr,
              });
            }
          } catch (err) {
            errors.push(
              `bg-check warning to ${volunteerEmail}: ${(err as Error).message}`,
            );
          }
        }
      }

      results.push({
        church_id: churchId,
        church_name: churchName,
        expiry_warnings: expiryWarnings,
        nudges,
        bg_check_warnings: bgCheckWarnings,
        bg_check_auto_expired: bgCheckAutoExpired,
        errors,
      });
    }

    const totalExpiry = results.reduce((s, r) => s + r.expiry_warnings, 0);
    const totalNudges = results.reduce((s, r) => s + r.nudges, 0);
    const totalBgWarnings = results.reduce(
      (s, r) => s + r.bg_check_warnings,
      0,
    );
    const totalBgAutoExpired = results.reduce(
      (s, r) => s + r.bg_check_auto_expired,
      0,
    );
    const failedCount = results.reduce((s, r) => s + r.errors.length, 0);

      return {
        response: NextResponse.json({
          success: true,
          churches_processed: results.length,
          total_expiry_warnings: totalExpiry,
          total_nudges: totalNudges,
          total_bg_check_warnings: totalBgWarnings,
          total_bg_check_auto_expired: totalBgAutoExpired,
          results,
        }),
        summary: {
          processed: results.length,
          failed: failedCount,
          metadata: {
            total_expiry_warnings: totalExpiry,
            total_nudges: totalNudges,
            total_bg_check_warnings: totalBgWarnings,
            total_bg_check_auto_expired: totalBgAutoExpired,
          },
        },
      };
    });
    return response;
  } catch (error) {
    log.error("Cron prerequisite-check failed", { error });
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
