/**
 * POST /api/checkin/child-alerts
 *
 * Kiosk endpoint — returns allergies + medical_notes for a specific set of
 * children that the kiosk operator has selected for check-in. Replaces the
 * old pattern of returning medical fields from /lookup (Track B.4 hygiene).
 *
 * Body: { church_id, child_ids: string[] }
 * Returns: { children: [{ id, has_alerts, allergies?, medical_notes? }] }
 *
 * Every successful reveal is audit-logged as `kiosk.medical_data_revealed`.
 * Requires X-Kiosk-Token header.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { audit, kioskActor } from "@/lib/server/audit";

const MAX_CHILDREN_PER_REQUEST = 12;

export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkin");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  let body: { church_id?: string; child_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { church_id, child_ids } = body;
  if (!church_id || !Array.isArray(child_ids) || child_ids.length === 0) {
    return NextResponse.json(
      { error: "Missing church_id or child_ids" },
      { status: 400 },
    );
  }
  if (child_ids.length > MAX_CHILDREN_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many children requested (max ${MAX_CHILDREN_PER_REQUEST})` },
      { status: 400 },
    );
  }

  const churchMismatch = assertKioskChurchMatch(kiosk, church_id);
  if (churchMismatch) return churchMismatch;

  try {
    const churchRef = adminDb.collection("churches").doc(church_id);

    // Try unified people collection first (children stored as Person with person_type=child).
    const unifiedDocs = await Promise.all(
      child_ids.map((id) => churchRef.collection("people").doc(id).get()),
    );

    const results: Array<{
      id: string;
      has_alerts: boolean;
      allergies?: string;
      medical_notes?: string;
    }> = [];
    const revealedIds: string[] = [];

    for (let i = 0; i < unifiedDocs.length; i++) {
      const id = child_ids[i];
      const snap = unifiedDocs[i];
      if (snap.exists) {
        const data = snap.data() as Record<string, unknown>;
        const cp = (data.child_profile ?? {}) as Record<string, unknown>;
        const hasAlerts = !!cp.has_alerts;
        const entry: (typeof results)[number] = { id, has_alerts: hasAlerts };
        if (hasAlerts) {
          if (typeof cp.allergies === "string" && cp.allergies.trim().length > 0) {
            entry.allergies = cp.allergies as string;
          }
          if (typeof cp.medical_notes === "string" && cp.medical_notes.trim().length > 0) {
            entry.medical_notes = cp.medical_notes as string;
          }
          revealedIds.push(id);
        }
        results.push(entry);
        continue;
      }

      // Fall back to legacy children collection.
      const legacy = await churchRef.collection("children").doc(id).get();
      if (legacy.exists) {
        const data = legacy.data() as Record<string, unknown>;
        const hasAlerts = !!data.has_alerts;
        const entry: (typeof results)[number] = { id, has_alerts: hasAlerts };
        if (hasAlerts) {
          if (typeof data.allergies === "string" && data.allergies.trim().length > 0) {
            entry.allergies = data.allergies as string;
          }
          if (typeof data.medical_notes === "string" && data.medical_notes.trim().length > 0) {
            entry.medical_notes = data.medical_notes as string;
          }
          revealedIds.push(id);
        }
        results.push(entry);
      }
    }

    if (revealedIds.length > 0) {
      void audit({
        church_id,
        actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
        action: "kiosk.medical_data_revealed",
        target_type: "child",
        // We log the count and IDs so an admin can see the trail. The
        // medical content itself is NOT logged — the audit trail records
        // access, not content.
        metadata: { child_ids: revealedIds, count: revealedIds.length },
        outcome: "ok",
      });
    }

    return NextResponse.json({ children: results });
  } catch (err) {
    console.error("[POST /api/checkin/child-alerts]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
