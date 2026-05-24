import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import type { ServicePlan, Song } from "@/lib/types";

/**
 * GET /api/service-plans/:id/export-propresenter?church_id=xxx
 * Export a service plan as ProPresenter-compatible JSON.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;
    const { id: planId } = await params;

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

    const plan = { id: planSnap.id, ...planSnap.data() } as ServicePlan;

    // Fetch song details for song items
    const songIds = plan.items
      .filter((item) => item.type === "song" && item.song_id)
      .map((item) => item.song_id!);

    const songMap = new Map<string, Song>();
    if (songIds.length > 0) {
      // Fetch songs in batches of 30 (Firestore "in" query limit)
      for (let i = 0; i < songIds.length; i += 30) {
        const batch = songIds.slice(i, i + 30);
        const snap = await adminDb
          .collection("churches")
          .doc(churchId)
          .collection("songs")
          .where("__name__", "in", batch)
          .get();

        for (const doc of snap.docs) {
          songMap.set(doc.id, { id: doc.id, ...doc.data() } as Song);
        }
      }
    }

    // Build ProPresenter-compatible JSON
    const proPresenterData = {
      name: plan.theme ?? `Service Plan — ${plan.service_date}`,
      date: plan.service_date,
      items: plan.items.map((item) => {
        const song = item.song_id ? songMap.get(item.song_id) : null;

        return {
          type: item.type,
          title: item.title ?? song?.title ?? item.type,
          key: item.key ?? song?.default_key ?? null,
          ccli_number: song?.ccli_number ?? null,
          ccli_publisher: song?.ccli_publisher ?? null,
          artist: song?.artist_credit ?? null,
          lyrics: song?.lyrics ?? null,
          arrangement_notes: item.arrangement_notes ?? null,
          notes: item.notes ?? null,
          duration_minutes: item.duration_minutes ?? null,
        };
      }),
      metadata: {
        exported_at: new Date().toISOString(),
        source: "VolunteerCal",
        plan_id: plan.id,
        service_date: plan.service_date,
        theme: plan.theme,
        speaker: plan.speaker,
        scripture_references: plan.scripture_references,
      },
    };

    const filename = `propresenter_${plan.service_date}_${planId.slice(0, 8)}.json`;

    return new NextResponse(JSON.stringify(proPresenterData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/service-plans/:id/export-propresenter]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
