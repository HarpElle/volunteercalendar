import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { ServicePlan, Song } from "@/lib/types";

/**
 * GET /api/cron/propresenter-export
 * Daily cron job that emails ProPresenter exports to tech/media leads
 * 24 hours before each published service plan.
 *
 * Secured by Vercel CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: {
    church_id: string;
    plan_id: string;
    service_date: string;
    sent_to: string[];
  }[] = [];

  try {
    // Find published plans with service_date = tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Get all churches
    const churchesSnap = await adminDb.collection("churches").get();

    for (const churchDoc of churchesSnap.docs) {
      const churchId = churchDoc.id;
      const churchData = churchDoc.data();

      // Find published plans for tomorrow
      const plansSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("service_plans")
        .where("service_date", "==", tomorrowStr)
        .where("published", "==", true)
        .get();

      for (const planDoc of plansSnap.docs) {
        const plan = { id: planDoc.id, ...planDoc.data() } as ServicePlan;

        // Skip plans with no song items
        const songItems = plan.items.filter((i) => i.type === "song" && i.song_id);
        if (songItems.length === 0) continue;

        // Fetch song details
        const songIds = songItems.map((i) => i.song_id!);
        const songMap = new Map<string, Song>();

        for (let i = 0; i < songIds.length; i += 30) {
          const batch = songIds.slice(i, i + 30);
          const snap = await adminDb
            .collection("churches")
            .doc(churchId)
            .collection("songs")
            .where("__name__", "in", batch)
            .get();

          for (const doc of snap.docs) {
            songMap.set(doc.id, { id: doc.id, ...doc.data() } as Song);
          }
        }

        // Build ProPresenter JSON
        const exportData = {
          name: plan.theme ?? `Service Plan — ${plan.service_date}`,
          date: plan.service_date,
          items: plan.items.map((item) => {
            const song = item.song_id ? songMap.get(item.song_id) : null;
            return {
              type: item.type,
              title: item.title ?? song?.title ?? item.type,
              key: item.key ?? song?.default_key ?? null,
              ccli_number: song?.ccli_number ?? null,
              lyrics: song?.lyrics ?? null,
              arrangement_notes: item.arrangement_notes ?? null,
            };
          }),
          metadata: {
            exported_at: new Date().toISOString(),
            source: "VolunteerCal",
            plan_id: plan.id,
            service_date: plan.service_date,
          },
        };

        // Find tech/media admins to email
        // Look for admins/schedulers in this church
        const membershipsSnap = await adminDb
          .collection("memberships")
          .where("church_id", "==", churchId)
          .where("role", "in", ["admin", "owner"])
          .where("status", "==", "active")
          .get();

        const recipients: string[] = [];
        for (const memDoc of membershipsSnap.docs) {
          const memData = memDoc.data();
          const userSnap = await adminDb.doc(`users/${memData.user_id}`).get();
          const email = userSnap.data()?.email;
          if (email) recipients.push(email);
        }

        if (recipients.length === 0) continue;

        // Send email via Resend
        const resendApiKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@volunteercal.com";

        if (resendApiKey) {
          const serviceName = churchData?.name ?? "Your Church";
          const jsonString = JSON.stringify(exportData, null, 2);

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: recipients,
              subject: `ProPresenter Export — ${plan.theme ?? plan.service_date} (${serviceName})`,
              text: [
                `Your ProPresenter export for ${plan.service_date} is attached.`,
                "",
                `Service: ${plan.theme ?? "Service Plan"}`,
                `Date: ${plan.service_date}`,
                `Songs: ${songItems.length}`,
                `Total items: ${plan.items.length}`,
                "",
                "Import this file into ProPresenter before your service.",
                "",
                "— VolunteerCal",
              ].join("\n"),
              attachments: [
                {
                  filename: `propresenter_${plan.service_date}.json`,
                  content: Buffer.from(jsonString).toString("base64"),
                },
              ],
            }),
          });
        }

        results.push({
          church_id: churchId,
          plan_id: plan.id,
          service_date: plan.service_date,
          sent_to: recipients,
        });
      }
    }

    return NextResponse.json({
      exports_sent: results.length,
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON propresenter-export]", error);
    return NextResponse.json({ error: "Export cron failed" }, { status: 500 });
  }
}
