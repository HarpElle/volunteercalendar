import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { ServicePlan, ServicePlanItem, Song } from "@/lib/types";

/**
 * POST /api/service-plans/{id}/publish
 *
 * Publish a service plan. Sets published flag, creates SongUsageRecord entries
 * for each song item, and updates each song's last_used_date and use_count.
 * Uses a batch write for atomicity.
 * Requires admin or scheduler role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { id: planId } = await params;

    const body = await req.json();
    const { church_id } = body as { church_id: string };

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership with admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const planRef = churchRef.collection("service_plans").doc(planId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: "Service plan not found" }, { status: 404 });
    }

    const plan = { id: planSnap.id, ...planSnap.data()! } as ServicePlan;

    if (plan.published) {
      return NextResponse.json(
        { error: "Service plan is already published" },
        { status: 409 },
      );
    }

    // Collect song items that have a valid song_id
    const songItems: ServicePlanItem[] = plan.items.filter(
      (item) => item.type === "song" && item.song_id,
    );

    // Fetch the service doc to get service_name
    const serviceSnap = await churchRef.collection("services").doc(plan.service_id).get();
    const serviceName = serviceSnap.exists
      ? (serviceSnap.data()!.name as string)
      : "Service";

    // Fetch all referenced song docs in parallel
    const uniqueSongIds = [...new Set(songItems.map((item) => item.song_id!))];
    const songDocs = await Promise.all(
      uniqueSongIds.map((songId) =>
        churchRef.collection("songs").doc(songId).get(),
      ),
    );
    const songsMap = new Map<string, Song>();
    for (const doc of songDocs) {
      if (doc.exists) {
        songsMap.set(doc.id, { id: doc.id, ...doc.data()! } as Song);
      }
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();

    // Mark the plan as published
    batch.update(planRef, {
      published: true,
      published_at: now,
    });

    // Create song usage records and update song stats
    let usageRecordsCreated = 0;

    for (const item of songItems) {
      const songId = item.song_id!;
      const song = songsMap.get(songId);
      if (!song) continue;

      // Create a SongUsageRecord
      const usageRef = churchRef.collection("song_usage").doc();
      batch.set(usageRef, {
        church_id,
        song_id: songId,
        service_plan_id: planId,
        service_date: plan.service_date,
        service_name: serviceName,
        song_title: song.title,
        ccli_number: song.ccli_number || null,
        key_used: item.key || song.default_key || null,
        created_at: now,
      });

      // Update the song's last_used_date and increment use_count
      const songRef = churchRef.collection("songs").doc(songId);
      batch.update(songRef, {
        last_used_date: plan.service_date,
        use_count: FieldValue.increment(1),
      });

      usageRecordsCreated++;
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      usage_records_created: usageRecordsCreated,
    });
  } catch (error) {
    console.error("[POST /api/service-plans/[id]/publish]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
