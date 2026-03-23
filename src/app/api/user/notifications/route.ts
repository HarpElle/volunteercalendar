import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { UserNotification } from "@/lib/types";

/**
 * GET /api/user/notifications?church_id=X&cursor=ISO&limit=30
 *
 * Returns paginated user notifications for the authenticated user,
 * scoped to a specific org. Ordered by created_at descending.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "church_id required" }, { status: 400 });
    }

    const limitParam = parseInt(searchParams.get("limit") || "30", 10);
    const limit = Math.min(Math.max(limitParam, 1), 100);
    const cursor = searchParams.get("cursor");

    let query = adminDb
      .collection("user_notifications")
      .where("user_id", "==", uid)
      .where("church_id", "==", churchId)
      .orderBy("created_at", "desc")
      .limit(limit + 1); // fetch one extra to detect has_more

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snap = await query.get();

    const hasMore = snap.docs.length > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

    const notifications: UserNotification[] = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as UserNotification[];

    const nextCursor = hasMore
      ? notifications[notifications.length - 1]?.created_at ?? null
      : null;

    return NextResponse.json({
      notifications,
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error("GET /api/user/notifications error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
