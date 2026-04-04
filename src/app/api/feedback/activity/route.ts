import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/feedback/activity?church_id=...&feedback_id=...
 * Returns the activity log for a feedback item. Admin/owner only.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const churchId = req.nextUrl.searchParams.get("church_id");
  const feedbackId = req.nextUrl.searchParams.get("feedback_id");

  if (!churchId || !feedbackId) {
    return NextResponse.json({ error: "Missing church_id or feedback_id" }, { status: 400 });
  }

  // Verify admin/owner
  const memSnap = await adminDb
    .collection("memberships")
    .where("user_id", "==", decoded.uid)
    .where("church_id", "==", churchId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (memSnap.empty) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const role = memSnap.docs[0].data().role;
  if (!["admin", "owner"].includes(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const snap = await adminDb
    .collection("churches")
    .doc(churchId)
    .collection("feedback")
    .doc(feedbackId)
    .collection("activity")
    .orderBy("created_at", "desc")
    .limit(50)
    .get();

  const activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ activities });
}
