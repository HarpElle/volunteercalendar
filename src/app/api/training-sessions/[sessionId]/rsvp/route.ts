import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { TrainingSessionRsvp } from "@/lib/types";

/**
 * POST /api/training-sessions/[sessionId]/rsvp
 *
 * Volunteer RSVPs (accept or decline) for a training session.
 * Body: { church_id, volunteer_id, status: "accepted" | "declined" }
 *
 * Auth: Bearer token + membership
 */
export async function POST(
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

    const { church_id, volunteer_id, status } = await req.json();
    if (!church_id || !volunteer_id || !["accepted", "declined"].includes(status)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    // Verify membership
    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membership.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const ref = adminDb.doc(`churches/${church_id}/training_sessions/${sessionId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const session = snap.data()!;
    if (session.status !== "scheduled") {
      return NextResponse.json({ error: "Session is not open for RSVP" }, { status: 400 });
    }

    // Check capacity for acceptances
    const currentRsvps = (session.rsvps as TrainingSessionRsvp[]) || [];
    const acceptedCount = currentRsvps.filter((r) => r.status === "accepted").length;

    if (status === "accepted" && session.capacity > 0 && acceptedCount >= session.capacity) {
      // Check if volunteer is updating an existing acceptance (no net change)
      const existing = currentRsvps.find((r) => r.volunteer_id === volunteer_id);
      if (!existing || existing.status !== "accepted") {
        return NextResponse.json({ error: "Session is full" }, { status: 409 });
      }
    }

    // Remove any existing RSVP from this volunteer, then add the new one
    const filteredRsvps = currentRsvps.filter((r) => r.volunteer_id !== volunteer_id);
    const newRsvp: TrainingSessionRsvp = {
      volunteer_id,
      status,
      responded_at: new Date().toISOString(),
    };

    await ref.update({ rsvps: [...filteredRsvps, newRsvp] });

    return NextResponse.json({ success: true, rsvp: newRsvp });
  } catch (err) {
    console.error("training-sessions rsvp error:", err);
    return NextResponse.json({ error: "Failed to RSVP" }, { status: 500 });
  }
}
