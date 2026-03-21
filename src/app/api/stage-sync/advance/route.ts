import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/stage-sync/advance
 * Advance to the next (or specific) item in the service plan.
 * Batch-writes to both the plan document and the live sync document.
 *
 * Body: { church_id, plan_id, target_index?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, plan_id, target_index } = body;

    if (!church_id || !plan_id) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, plan_id" },
        { status: 400 },
      );
    }

    // Verify membership
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get the service plan
    const planRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("service_plans")
      .doc(plan_id);

    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return NextResponse.json({ error: "Service plan not found" }, { status: 404 });
    }

    const plan = planSnap.data()!;
    const stageSync = plan.stage_sync;

    if (!stageSync?.enabled || !stageSync?.access_token) {
      return NextResponse.json(
        { error: "Stage Sync is not enabled for this plan" },
        { status: 422 },
      );
    }

    const items = plan.items ?? [];
    const currentIndex = stageSync.current_item_index ?? 0;

    // Determine target index
    let nextIndex: number;
    if (typeof target_index === "number") {
      nextIndex = Math.max(0, Math.min(target_index, items.length - 1));
    } else {
      nextIndex = Math.min(currentIndex + 1, items.length - 1);
    }

    const nextItem = items[nextIndex];
    const now = new Date().toISOString();

    // Batch write to plan and live document
    const batch = adminDb.batch();

    batch.update(planRef, {
      "stage_sync.current_item_id": nextItem?.id ?? null,
      "stage_sync.current_item_index": nextIndex,
      "stage_sync.last_advanced_at": now,
    });

    const liveRef = adminDb.collection("stage_sync_live").doc(stageSync.access_token);
    batch.update(liveRef, {
      current_item_id: nextItem?.id ?? null,
      current_item_index: nextIndex,
      last_advanced_at: now,
    });

    await batch.commit();

    return NextResponse.json({
      current_item_index: nextIndex,
      current_item_id: nextItem?.id ?? null,
      total_items: items.length,
      is_last: nextIndex >= items.length - 1,
    });
  } catch (error) {
    console.error("[POST /api/stage-sync/advance]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
