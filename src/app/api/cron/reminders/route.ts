import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { safeCompare } from "@/lib/utils/safe-compare";

/**
 * GET /api/cron/reminders?hours=48
 *
 * Called by Vercel Cron daily. Iterates all churches and triggers
 * the reminder API for each one.
 *
 * Auth: Vercel sets the Authorization header automatically for cron jobs,
 * but we also verify CRON_SECRET as a fallback.
 */
export async function GET(request: Request) {
  // Verify this is a legitimate cron call
  const authHeader = request.headers.get("authorization");
  const isVercelCron = safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`);

  if (!isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get("hours") || "48", 10);

  if (hours !== 24 && hours !== 48) {
    return NextResponse.json({ error: "hours must be 24 or 48" }, { status: 400 });
  }

  try {
    // Get all churches
    const churchesSnap = await adminDb.collection("churches").get();

    if (churchesSnap.empty) {
      return NextResponse.json({ success: true, message: "No churches found", results: [] });
    }

    const origin = request.headers.get("origin")
      || request.headers.get("x-forwarded-proto") + "://" + request.headers.get("x-forwarded-host")
      || "https://volunteercal.com";

    const results: { church_id: string; church_name: string; sent_email: number; sent_sms: number; skipped: number; error?: string }[] = [];

    for (const churchDoc of churchesSnap.docs) {
      const churchId = churchDoc.id;
      const churchName = (churchDoc.data().name as string) || churchId;

      try {
        const res = await fetch(`${origin}/api/reminders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": process.env.CRON_SECRET || "",
            "Origin": origin,
          },
          body: JSON.stringify({ church_id: churchId, hours }),
        });

        const data = await res.json();
        results.push({
          church_id: churchId,
          church_name: churchName,
          sent_email: data.sent_email || 0,
          sent_sms: data.sent_sms || 0,
          skipped: data.skipped || 0,
          error: res.ok ? undefined : data.error,
        });
      } catch (err) {
        results.push({
          church_id: churchId,
          church_name: churchName,
          sent_email: 0,
          sent_sms: 0,
          skipped: 0,
          error: (err as Error).message,
        });
      }
    }

    const totalEmail = results.reduce((sum, r) => sum + r.sent_email, 0);
    const totalSms = results.reduce((sum, r) => sum + r.sent_sms, 0);

    return NextResponse.json({
      success: true,
      hours,
      churches_processed: results.length,
      total_email: totalEmail,
      total_sms: totalSms,
      results,
    });
  } catch (error) {
    console.error("Cron reminder error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
