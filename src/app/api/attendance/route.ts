import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

interface AttendanceEntry {
  id: string;
  attended: boolean;
  /** "event_signup" or "assignment" */
  type: "event_signup" | "assignment";
}

/**
 * POST /api/attendance
 *
 * Batch-update attendance for event signups and/or service assignments.
 * Also syncs volunteer stats (no_show_count) on the volunteer record.
 *
 * Body: { church_id: string, entries: AttendanceEntry[] }
 * Requires: scheduler or above role for the church.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, entries } = body as {
      church_id: string;
      entries: AttendanceEntry[];
    };

    if (!church_id || !entries || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: "Missing church_id or entries" },
        { status: 400 },
      );
    }

    if (entries.length > 200) {
      return NextResponse.json(
        { error: "Maximum 200 entries per batch" },
        { status: 400 },
      );
    }

    // Verify the user is scheduler or above for this church
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }
    const role = membershipSnap.data()?.role;
    const schedulerRoles = ["owner", "admin", "scheduler"];
    if (!schedulerRoles.includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions — scheduler or above required" },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();

    // Track volunteer no-show changes: volunteer_id → delta (+1 for new no-show, -1 for corrected)
    const noShowDeltas = new Map<string, number>();

    for (const entry of entries) {
      let docRef;
      let previousAttended: boolean | null = null;
      let volunteerId: string | null = null;

      if (entry.type === "event_signup") {
        docRef = adminDb.doc(`event_signups/${entry.id}`);
        const snap = await docRef.get();
        if (!snap.exists) continue;
        const data = snap.data()!;
        if (data.church_id !== church_id) continue; // security: verify ownership
        previousAttended = data.attended ?? null;
        volunteerId = data.volunteer_id || null;
      } else {
        docRef = adminDb.doc(`churches/${church_id}/assignments/${entry.id}`);
        const snap = await docRef.get();
        if (!snap.exists) continue;
        const data = snap.data()!;
        previousAttended = data.attended ?? null;
        volunteerId = data.volunteer_id || null;
      }

      batch.update(docRef, {
        attended: entry.attended,
        attended_at: now,
      });

      // Calculate no-show delta for volunteer stats
      if (volunteerId) {
        const wasNoShow = previousAttended === false;
        const isNoShow = entry.attended === false;
        if (!wasNoShow && isNoShow) {
          // Newly marked as no-show
          noShowDeltas.set(volunteerId, (noShowDeltas.get(volunteerId) || 0) + 1);
        } else if (wasNoShow && !isNoShow) {
          // Corrected from no-show to present
          noShowDeltas.set(volunteerId, (noShowDeltas.get(volunteerId) || 0) - 1);
        }
      }
    }

    // Apply no-show deltas to volunteer records
    for (const [volId, delta] of noShowDeltas) {
      if (delta === 0) continue;
      const volRef = adminDb.doc(`churches/${church_id}/volunteers/${volId}`);
      batch.update(volRef, {
        "stats.no_show_count": FieldValue.increment(delta),
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      updated: entries.length,
      no_show_updates: noShowDeltas.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
