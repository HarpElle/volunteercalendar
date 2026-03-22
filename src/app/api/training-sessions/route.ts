import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { TrainingSession } from "@/lib/types";

/**
 * GET /api/training-sessions?church_id=...&ministry_id=...&status=...
 * List training sessions. Optional filters by ministry_id and status.
 *
 * POST /api/training-sessions
 * Create a new training session tied to a prerequisite step.
 *
 * Auth: Bearer token + admin/scheduler role
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { searchParams } = new URL(req.url);
    const church_id = searchParams.get("church_id");
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership
    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    let query: FirebaseFirestore.Query = adminDb.collection(`churches/${church_id}/training_sessions`);

    const ministryId = searchParams.get("ministry_id");
    if (ministryId) {
      query = query.where("ministry_id", "==", ministryId);
    }

    const status = searchParams.get("status");
    if (status) {
      query = query.where("status", "==", status);
    }

    const snap = await query.get();
    const sessions: TrainingSession[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as TrainingSession[];

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("training-sessions GET error:", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const {
      church_id,
      prerequisite_step_id,
      ministry_id,
      title,
      date,
      start_time,
      end_time,
      location,
      capacity,
      auto_complete,
    } = body;

    if (!church_id || !prerequisite_step_id || !ministry_id || !title || !date || !start_time || !end_time || !location) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists || !["owner", "admin", "scheduler"].includes(membership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const sessionData = {
      church_id,
      prerequisite_step_id,
      ministry_id,
      title,
      date,
      start_time,
      end_time,
      location,
      capacity: capacity || 0,
      auto_complete: auto_complete ?? true,
      status: "scheduled" as const,
      rsvps: [],
      attendee_ids: [],
      created_by: userId,
      created_at: new Date().toISOString(),
    };

    const docRef = await adminDb.collection(`churches/${church_id}/training_sessions`).add(sessionData);

    return NextResponse.json({ id: docRef.id, ...sessionData }, { status: 201 });
  } catch (err) {
    console.error("training-sessions POST error:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
