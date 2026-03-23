import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { safeCompare } from "@/lib/utils/safe-compare";

/**
 * GET /api/cron/notification-cleanup
 *
 * Deletes expired user notifications (expires_at < now).
 * Runs weekly via Vercel cron. Auth: CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || !safeCompare(secret, process.env.CRON_SECRET || "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    const snap = await adminDb
      .collection("user_notifications")
      .where("expires_at", "<", now)
      .limit(5000)
      .get();

    if (snap.empty) {
      return NextResponse.json({ deleted: 0 });
    }

    // Delete in batches of 500 (Firestore limit)
    let deleted = 0;
    for (let i = 0; i < snap.docs.length; i += 500) {
      const chunk = snap.docs.slice(i, i + 500);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += chunk.length;
    }

    return NextResponse.json({ deleted });
  } catch (err) {
    console.error("notification-cleanup error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
