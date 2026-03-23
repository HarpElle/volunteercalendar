import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * PATCH /api/user/notifications/read
 *
 * Mark notifications as read. Two modes:
 * - { notification_id, church_id } → mark single notification
 * - { church_id } (no notification_id) → mark ALL unread for user+church
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const body = await req.json();
    const { notification_id, church_id } = body as {
      notification_id?: string;
      church_id: string;
    };

    if (!church_id) {
      return NextResponse.json({ error: "church_id required" }, { status: 400 });
    }

    if (notification_id) {
      // Mark single notification as read
      const ref = adminDb.collection("user_notifications").doc(notification_id);
      const doc = await ref.get();

      if (!doc.exists) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const data = doc.data()!;
      if (data.user_id !== uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (!data.read) {
        await ref.update({ read: true });
      }

      return NextResponse.json({ marked: 1 });
    }

    // Mark all unread notifications as read for this user+church
    const snap = await adminDb
      .collection("user_notifications")
      .where("user_id", "==", uid)
      .where("church_id", "==", church_id)
      .where("read", "==", false)
      .get();

    if (snap.empty) {
      return NextResponse.json({ marked: 0 });
    }

    // Batch update in chunks of 500
    let marked = 0;
    for (let i = 0; i < snap.docs.length; i += 500) {
      const chunk = snap.docs.slice(i, i + 500);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.update(doc.ref, { read: true });
      }
      await batch.commit();
      marked += chunk.length;
    }

    return NextResponse.json({ marked });
  } catch (err) {
    console.error("PATCH /api/user/notifications/read error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
