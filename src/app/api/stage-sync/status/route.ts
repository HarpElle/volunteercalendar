import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/stage-sync/status?church_id=xxx&plan_id=yyy
 * Get current Stage Sync state for conductor reconnection.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { searchParams } = req.nextUrl;
    const churchId = searchParams.get("church_id");
    const planId = searchParams.get("plan_id");

    if (!churchId || !planId) {
      return NextResponse.json(
        { error: "Missing required params: church_id, plan_id" },
        { status: 400 },
      );
    }

    // Verify membership
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Get the service plan
    const planSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("service_plans")
      .doc(planId)
      .get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: "Service plan not found" }, { status: 404 });
    }

    const plan = planSnap.data()!;
    const stageSync = plan.stage_sync;

    // Resolve chart_data for song items
    const planItems = (plan.items ?? []) as Record<string, unknown>[];
    const resolvedItems = [];
    for (const item of planItems) {
      let chartData = null;
      if (item.type === "song" && item.song_id) {
        if (item.arrangement_id) {
          const arrSnap = await adminDb
            .collection("churches").doc(churchId)
            .collection("arrangements").doc(item.arrangement_id as string)
            .get();
          if (arrSnap.exists) chartData = arrSnap.data()?.chart_data ?? null;
        }
        if (!chartData) {
          const songSnap = await adminDb
            .collection("churches").doc(churchId)
            .collection("songs").doc(item.song_id as string)
            .get();
          if (songSnap.exists) chartData = songSnap.data()?.chart_data ?? null;
        }
      }
      resolvedItems.push({ ...item, chart_data: chartData });
    }

    if (!stageSync?.enabled) {
      return NextResponse.json({
        enabled: false,
        items: resolvedItems,
      });
    }

    return NextResponse.json({
      enabled: true,
      current_item_id: stageSync.current_item_id,
      current_item_index: stageSync.current_item_index,
      conductor_user_id: stageSync.conductor_user_id,
      last_advanced_at: stageSync.last_advanced_at,
      access_token: stageSync.access_token,
      viewers_connected: stageSync.viewers_connected,
      items: resolvedItems,
      conductor_url: `/stage-sync/conductor/${churchId}/${planId}`,
      participant_url: `/stage-sync/view/${churchId}/${planId}`,
    });
  } catch (error) {
    console.error("[GET /api/stage-sync/status]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
