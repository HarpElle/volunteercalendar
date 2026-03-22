import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { safeCompare } from "@/lib/utils/safe-compare";
import { Resend } from "resend";
import { buildExpiryWarningEmail } from "@/lib/utils/emails/prerequisite-expiry-warning";
import { buildPrerequisiteNudgeEmail } from "@/lib/utils/emails/prerequisite-nudge";
import type { OnboardingStep, VolunteerJourneyStep } from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);

/** How many days before expiry to send the warning. */
const EXPIRY_WARNING_DAYS = 30;
/** How many days of "in_progress" before sending a nudge. */
const STALLED_DAYS = 30;

/**
 * GET /api/cron/prerequisite-check
 *
 * Daily cron job. For each church:
 *   1. Finds volunteer journey steps with approaching expiry → sends warning email
 *   2. Finds volunteers with stalled in_progress status → sends nudge email
 *
 * Auth: CRON_SECRET Bearer token (Vercel Cron)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const churchesSnap = await adminDb.collection("churches").get();
    if (churchesSnap.empty) {
      return NextResponse.json({ success: true, message: "No churches", results: [] });
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
      errors: string[];
    }[] = [];

    for (const churchDoc of churchesSnap.docs) {
      const churchId = churchDoc.id;
      const churchName = (churchDoc.data().name as string) || churchId;
      const orgPrereqs = (churchDoc.data().org_prerequisites as OnboardingStep[]) || [];

      let expiryWarnings = 0;
      let nudges = 0;
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
      const volunteersSnap = await adminDb.collection(`churches/${churchId}/volunteers`).get();

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
              } catch (err) {
                errors.push(`nudge to ${volunteerEmail}: ${(err as Error).message}`);
              }
            }
          }
        }
      }

      results.push({
        church_id: churchId,
        church_name: churchName,
        expiry_warnings: expiryWarnings,
        nudges,
        errors,
      });
    }

    const totalExpiry = results.reduce((s, r) => s + r.expiry_warnings, 0);
    const totalNudges = results.reduce((s, r) => s + r.nudges, 0);

    return NextResponse.json({
      success: true,
      churches_processed: results.length,
      total_expiry_warnings: totalExpiry,
      total_nudges: totalNudges,
      results,
    });
  } catch (error) {
    console.error("Cron prerequisite-check error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
