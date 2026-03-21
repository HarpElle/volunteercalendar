import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/stage-sync/enable
 * Enable Stage Sync for a service plan. Creates an access token and
 * initializes the live sync document.
 *
 * Body: { church_id, plan_id }
 * Returns: { access_token, conductor_url, participant_url }
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
    const { church_id, plan_id } = body;

    if (!church_id || !plan_id) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, plan_id" },
        { status: 400 },
      );
    }

    // Verify admin/scheduler role
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

    // If already enabled, return existing token
    if (plan.stage_sync?.enabled && plan.stage_sync?.access_token) {
      return NextResponse.json({
        access_token: plan.stage_sync.access_token,
        conductor_url: `/stage-sync/conductor/${church_id}/${plan_id}`,
        participant_url: `/stage-sync/view/${church_id}/${plan_id}`,
        already_enabled: true,
      });
    }

    // Create a new unguessable access token
    const accessToken = randomUUID();
    const now = new Date().toISOString();

    const stageSyncState = {
      enabled: true,
      current_item_id: null,
      current_item_index: 0,
      conductor_user_id: userId,
      last_advanced_at: null,
      access_token: accessToken,
      viewers_connected: 0,
    };

    // Batch write: update plan + create live sync document
    const batch = adminDb.batch();

    batch.update(planRef, { stage_sync: stageSyncState });

    // Create the public live sync document (readable by anyone with the token)
    const liveRef = adminDb.collection("stage_sync_live").doc(accessToken);
    batch.set(liveRef, {
      church_id,
      plan_id,
      current_item_id: null,
      current_item_index: 0,
      items: (plan.items ?? []).map((item: Record<string, unknown>) => ({
        id: item.id,
        type: item.type,
        title: item.title ?? null,
        song_id: item.song_id ?? null,
        key: item.key ?? null,
        arrangement_notes: item.arrangement_notes ?? null,
        lyrics: null, // Lyrics loaded separately per item
      })),
      last_advanced_at: null,
      started_at: now,
    });

    // Store token mapping for lookups
    const tokenRef = adminDb.collection("stage_sync_tokens").doc(accessToken);
    batch.set(tokenRef, {
      church_id,
      plan_id,
      created_by: userId,
      created_at: now,
    });

    await batch.commit();

    return NextResponse.json({
      access_token: accessToken,
      conductor_url: `/stage-sync/conductor/${church_id}/${plan_id}`,
      participant_url: `/stage-sync/view/${church_id}/${plan_id}`,
      already_enabled: false,
    });
  } catch (error) {
    console.error("[POST /api/stage-sync/enable]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
