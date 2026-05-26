import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { log } from "@/lib/log";
import { withCronRun } from "@/lib/server/cron-runs";

export const maxDuration = 300;

/**
 * GET /api/cron/notification-cleanup
 *
 * Deletes expired user notifications (expires_at < now).
 * Runs weekly via Vercel cron.
 */
export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;

  try {
    const { response } = await withCronRun("notification-cleanup", async () => {
      const now = new Date().toISOString();

      const snap = await adminDb
        .collection("user_notifications")
        .where("expires_at", "<", now)
        .limit(5000)
        .get();

      if (snap.empty) {
        return {
          response: NextResponse.json({ deleted: 0 }),
          summary: { processed: 0 },
        };
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

      return {
        response: NextResponse.json({ deleted }),
        summary: { processed: deleted },
      };
    });
    return response;
  } catch (err) {
    log.error("Cron notification-cleanup failed", { error: err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
