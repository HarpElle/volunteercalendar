import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/memberships?church_id=xxx
 * Fetch all memberships for a church. Uses Admin SDK to bypass Firestore
 * security-rule limitations on collection-level queries.
 * Requires Bearer token from an active admin/owner of the church.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }

    // Verify caller is an active admin/owner of this church
    const callerMemSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("church_id", "==", churchId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (callerMemSnap.empty) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    const callerRole = callerMemSnap.docs[0].data().role;
    if (!["admin", "owner", "scheduler"].includes(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch all memberships for this church
    const snap = await adminDb
      .collection("memberships")
      .where("church_id", "==", churchId)
      .get();

    const memberships: Record<string, unknown>[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Enrich with user display data (Admin SDK bypasses self-read-only rule)
    const uniqueUserIds = [...new Set(
      memberships.map((m) => m.user_id as string).filter(Boolean),
    )];
    const userDocs = await Promise.all(
      uniqueUserIds.map((uid) => adminDb.collection("users").doc(uid).get()),
    );
    const userMap = new Map<string, { display_name: string; email: string }>();
    for (const udoc of userDocs) {
      if (udoc.exists) {
        const d = udoc.data()!;
        userMap.set(udoc.id, {
          display_name: (d.display_name as string) || "",
          email: (d.email as string) || "",
        });
      }
    }
    for (const mem of memberships) {
      const userData = userMap.get(mem.user_id as string);
      if (userData) {
        mem._user_display_name = userData.display_name;
        mem._user_email = userData.email;
      }
    }

    return NextResponse.json(memberships);
  } catch (err) {
    console.error("[API /memberships] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
