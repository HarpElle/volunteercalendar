import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/calendar-feeds/regenerate-all
 * Body: { church_id }
 *
 * Org-admin-only incident-response action. Regenerates EVERY calendar
 * feed's secret_token in the org in one shot — invalidating every
 * outstanding iCal URL the org has issued. Use when:
 *   - A bulk leak is suspected (e.g. an export of feed URLs got loose)
 *   - The org is rotating to a new auth posture pre-launch
 *   - Routine periodic rotation (e.g. quarterly)
 *
 * Each volunteer must then re-subscribe to their personal feed; admin
 * communication is the user's responsibility (we don't auto-notify
 * because the act of rotating IS the incident response — adding email
 * latency defeats the purpose).
 *
 * Does NOT touch revoked feeds (skip them; they're already disabled)
 * and does NOT touch the public-room-calendar token (that lives on
 * roomSettings/config, not in calendar_feeds — separate rotation
 * action lives in Rooms → Settings).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let userId: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const churchId = body.church_id as string | undefined;
    if (!churchId) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }

    // Admin/owner only
    const memSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
      .get();
    if (!memSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = (memSnap.data()?.role as string) || "";
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only org admins can regenerate all feeds" },
        { status: 403 },
      );
    }

    const feedsSnap = await adminDb
      .collection(`churches/${churchId}/calendar_feeds`)
      .get();

    let rotated = 0;
    const batch = adminDb.batch();
    for (const doc of feedsSnap.docs) {
      const feed = doc.data();
      if (feed.revoked_at) continue; // skip revoked feeds
      batch.update(doc.ref, { secret_token: randomUUID() });
      rotated++;
    }
    if (rotated > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, rotated });
  } catch (err) {
    console.error("[POST regenerate-all]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
