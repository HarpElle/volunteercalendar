import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/training-sessions/[sessionId]?church_id=...
 * PUT /api/training-sessions/[sessionId]  — update session details
 * DELETE /api/training-sessions/[sessionId]  — cancel session
 *
 * Auth: Bearer token + admin/scheduler role
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const church_id = new URL(req.url).searchParams.get("church_id");
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const snap = await adminDb.doc(`churches/${church_id}/training_sessions/${sessionId}`).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: { id: snap.id, ...snap.data() } });
  } catch (err) {
    console.error("training-sessions GET error:", err);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, ...updates } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists || !["owner", "admin", "scheduler"].includes(membership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const ref = adminDb.doc(`churches/${church_id}/training_sessions/${sessionId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Only allow updating safe fields
    const allowed = ["title", "date", "start_time", "end_time", "location", "capacity", "auto_complete", "status"];
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    await ref.update(safeUpdates);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("training-sessions PUT error:", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const church_id = new URL(req.url).searchParams.get("church_id");
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists || !["owner", "admin", "scheduler"].includes(membership.data()?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const ref = adminDb.doc(`churches/${church_id}/training_sessions/${sessionId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await ref.update({ status: "cancelled" });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("training-sessions DELETE error:", err);
    return NextResponse.json({ error: "Failed to cancel session" }, { status: 500 });
  }
}
