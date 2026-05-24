import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/calendar-feeds/[feedId]/regenerate-token
 * Body: { church_id }
 *
 * Generates a new secret_token on a calendar feed. The old token stops
 * working immediately (no grace period — Pass G plan decision #4 + #5).
 * Caller must be the feed's created_by_user_id.
 *
 * The feed itself (label, type, target_id, ownership) is preserved —
 * only the URL changes. Use /revoke for permanent disablement.
 *
 * Use case: user shared their iCal URL accidentally and wants to
 * invalidate the leaked copy while keeping the feed usable.
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

    // Ownership check: only the creator can rotate. No admin override —
    // even an admin shouldn't be able to silently rotate a volunteer's
    // personal feed without their knowledge.
    if (feed.created_by_user_id !== userId) {
      return NextResponse.json(
        { error: "You can only regenerate your own feeds" },
        { status: 403 },
      );
    }

    // If already revoked, can't regenerate — must create a new feed
    if (feed.revoked_at) {
      return NextResponse.json(
        { error: "This feed is revoked. Create a new feed instead." },
        { status: 409 },
      );
    }

    const newToken = randomUUID();
    await feedRef.update({
      secret_token: newToken,
    });

    return NextResponse.json({ success: true, secret_token: newToken });
  } catch (err) {
    console.error("[POST regenerate-token]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
