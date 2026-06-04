/**
 * GET /api/checkin/kiosk-commands
 *
 * Kiosk polls for pending commands targeted at its station. Returns
 * the list and atomically stamps `picked_up_at` so a second poll
 * (or a parallel tab) won't process the same command twice.
 *
 * Auth: kiosk station token. Bootstrap tokens can't poll — they have
 * no station_id to filter by. Returns empty list (not an error) when
 * no station_id is bound so the kiosk's polling loop can run before
 * activation completes without spamming errors.
 *
 * Scope: uses `lookup` (it's a read with a side-effect-only mark).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireKioskToken } from "@/lib/server/authz";
import type { KioskCommand } from "@/lib/types";

export async function GET(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "lookup");
  if (kiosk instanceof NextResponse) return kiosk;

  // 60 polls/min = once per second worst case. The actual kiosk polls
  // every ~15s. Cheap pre-check before the Firestore round-trip.
  const limited = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  // Bootstrap tokens have no station — return empty without error so
  // the kiosk poll loop is harmless before activation finishes.
  if (!kiosk.station_id || !kiosk.church_id) {
    return NextResponse.json({ commands: [] });
  }

  try {
    const churchRef = adminDb.collection("churches").doc(kiosk.church_id);
    const snap = await churchRef
      .collection("kiosk_commands")
      .where("target_station_id", "==", kiosk.station_id)
      .where("status", "==", "pending")
      .where("picked_up_at", "==", null)
      .limit(10)
      .get();

    if (snap.empty) {
      return NextResponse.json({ commands: [] });
    }

    // Atomically mark picked up. If the same command gets picked twice
    // (e.g. user has two kiosk tabs open) the second mark just no-ops;
    // the kiosk-side handler is idempotent for "test_print" anyway
    // (printing the same label twice is the worst case).
    const now = new Date().toISOString();
    const batch = adminDb.batch();
    const commands: KioskCommand[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as KioskCommand;
      batch.update(doc.ref, { picked_up_at: now });
      commands.push({ ...data, picked_up_at: now });
    }
    await batch.commit();

    return NextResponse.json({ commands });
  } catch (error) {
    console.error("[GET /api/checkin/kiosk-commands]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
