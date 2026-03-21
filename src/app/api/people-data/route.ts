import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/people-data?church_id=xxx
 * Fetch all data needed by the People page using Admin SDK.
 * Bypasses Firestore security rules (which can fail on client-side
 * collection queries that depend on get()/exists() helpers).
 * Auth: Bearer token from an active admin/owner/scheduler.
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

    // Verify caller is an active member with sufficient role
    const callerSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("church_id", "==", churchId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (callerSnap.empty) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }
    const callerRole = callerSnap.docs[0].data().role;
    if (!["scheduler", "admin", "owner"].includes(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Fetch all data in parallel
    const [
      volsSnap,
      minsSnap,
      memsSnap,
      svcsSnap,
      hhSnap,
      churchDoc,
      queueSnap,
    ] = await Promise.all([
      churchRef.collection("volunteers").get(),
      churchRef.collection("ministries").get(),
      adminDb.collection("memberships").where("church_id", "==", churchId).get(),
      churchRef.collection("services").get(),
      churchRef.collection("households").get(),
      churchRef.get(),
      churchRef.collection("invite_queue").get(),
    ]);

    type Doc = Record<string, unknown> & { id: string };
    const toDoc = (d: FirebaseFirestore.QueryDocumentSnapshot): Doc => ({ id: d.id, ...d.data() });
    const volunteers: Doc[] = volsSnap.docs.map(toDoc);
    const ministries: Doc[] = minsSnap.docs.map(toDoc);
    const memberships: Doc[] = memsSnap.docs.map(toDoc);
    const services: Doc[] = svcsSnap.docs.map(toDoc);
    const households: Doc[] = hhSnap.docs.map(toDoc);
    const queueItems: Doc[] = queueSnap.docs.map(toDoc);

    const church = churchDoc.exists
      ? { name: churchDoc.data()!.name || "", subscription_tier: churchDoc.data()!.subscription_tier || "free", org_type: churchDoc.data()!.org_type }
      : null;

    // Auto-sync: create volunteer records for active members missing from roster
    const volsByUserId = new Set(volunteers.map((v: Record<string, unknown>) => v.user_id).filter(Boolean));
    const volsByEmail = new Set(volunteers.map((v: Record<string, unknown>) => (v.email as string)?.toLowerCase()).filter(Boolean));
    const activeMembers = memberships.filter(
      (m: Record<string, unknown>) => m.status === "active" && m.user_id && !volsByUserId.has(m.user_id as string),
    );

    const created: Record<string, unknown>[] = [];
    for (const mem of activeMembers) {
      const userDoc = await adminDb.collection("users").doc(mem.user_id as string).get();
      const userData = userDoc.data() || {};
      const memEmail = (userData.email as string)?.toLowerCase() || "";
      if (volsByEmail.has(memEmail)) continue;

      const now = new Date().toISOString();
      const volData: Record<string, unknown> = {
        church_id: churchId,
        name: userData.display_name || memEmail || "Member",
        email: userData.email || "",
        phone: userData.phone || null,
        user_id: mem.user_id,
        membership_id: mem.id,
        status: "active",
        ministry_ids: [],
        role_ids: [],
        campus_ids: [],
        household_id: null,
        availability: {
          blockout_dates: [],
          recurring_unavailable: [],
          preferred_frequency: 2,
          max_roles_per_month: 8,
        },
        reminder_preferences: { channels: ["email"] },
        stats: {
          times_scheduled_last_90d: 0,
          last_served_date: null,
          decline_count: 0,
          no_show_count: 0,
        },
        imported_from: null,
        created_at: now,
      };
      const newRef = await churchRef.collection("volunteers").add(volData);
      created.push({ ...volData, id: newRef.id });
      volsByEmail.add(memEmail);
      volsByUserId.add(mem.user_id as string);
    }

    return NextResponse.json({
      volunteers: [...volunteers, ...created],
      ministries,
      memberships,
      services,
      households,
      church,
      queueItems,
    });
  } catch (err) {
    console.error("[API /people-data] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
