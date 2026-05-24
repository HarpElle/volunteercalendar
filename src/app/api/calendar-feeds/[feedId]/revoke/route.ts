import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/calendar-feeds/[feedId]/revoke
 * Body: { church_id }
 *
 * Revokes a calendar feed permanently. Sets revoked_at; the calendar
 * API endpoints check this field and return 404 for any token belonging
 * to a revoked feed. The iCal client subscription will stop receiving
 * updates and eventually surface a "calendar removed" notice.
 *
 * Revocation is irreversible — user must create a new feed if they
 * change their mind. Different from regenerating (which keeps the feed
 * alive with a new secret_token).
 *
 * Caller must be the feed's created_by_user_id.
 *
 * Use case: user wants to permanently shut down a feed (e.g. they no
 * longer need iCal sync, or they're rotating away from this tool).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ feedId: string }> },
) {
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

    const { feedId } = await params;
    const body = await req.json().catch(() => ({}));
    const churchId = body.church_id as string | undefined;
    if (!churchId) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }

    const feedRef = adminDb.doc(
      `churches/${churchId}/calendar_feeds/${feedId}`,
    );
    const feedSnap = await feedRef.get();
    if (!feedSnap.exists) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }
    const feed = feedSnap.data()!;

    if (feed.created_by_user_id !== userId) {
      return NextResponse.json(
        { error: "You can only revoke your own feeds" },
        { status: 403 },
      );
    }

    if (feed.revoked_at) {
      return NextResponse.json({ success: true, already_revoked: true });
    }

    await feedRef.update({
      revoked_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST revoke]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
