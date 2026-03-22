import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { timingSafeEqual } from "crypto";
import type { CheckInSession, CheckInAlert } from "@/lib/types";

/**
 * POST /api/checkin/checkout
 * Unauthenticated kiosk/volunteer endpoint — verifies security code and checks out a child.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { church_id, session_id, security_code, volunteer_user_id } =
      body as {
        church_id: string;
        session_id: string;
        security_code: string;
        volunteer_user_id?: string;
      };

    if (!church_id || !session_id || !security_code) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Load session
    const sessionSnap = await churchRef
      .collection("checkInSessions")
      .doc(session_id)
      .get();

    if (!sessionSnap.exists) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    const session = sessionSnap.data() as CheckInSession;

    if (session.checked_out_at) {
      return NextResponse.json(
        { error: "Already checked out" },
        { status: 409 },
      );
    }

    // Check code expiry
    const now = new Date();
    if (new Date(session.security_code_expires_at) < now) {
      // Create alert for expired code attempt
      const alertId = adminDb.collection("_").doc().id;
      const alert: CheckInAlert = {
        id: alertId,
        church_id,
        session_id,
        child_id: session.child_id,
        alert_type: "expired_code",
        attempted_code: security_code,
        occurred_at: now.toISOString(),
        resolved: false,
      };
      await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

      return NextResponse.json(
        { error: "code_expired", message: "Security code has expired. Please see a staff member." },
        { status: 403 },
      );
    }

    // Constant-time comparison to prevent timing attacks
    const codeA = Buffer.from(security_code.toUpperCase().padEnd(4));
    const codeB = Buffer.from(session.security_code.toUpperCase().padEnd(4));
    const codesMatch = codeA.length === codeB.length && timingSafeEqual(codeA, codeB);

    if (!codesMatch) {
      // Create alert for wrong code
      const alertId = adminDb.collection("_").doc().id;
      const alert: CheckInAlert = {
        id: alertId,
        church_id,
        session_id,
        child_id: session.child_id,
        alert_type: "wrong_code",
        attempted_code: security_code,
        occurred_at: now.toISOString(),
        resolved: false,
      };
      await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

      return NextResponse.json(
        { error: "code_mismatch", message: "Security code does not match." },
        { status: 403 },
      );
    }

    // Code matches — check out
    await churchRef.collection("checkInSessions").doc(session_id).update({
      checked_out_at: now.toISOString(),
      checked_out_by_user_id: volunteer_user_id || null,
    });

    // Load child name for response
    const childSnap = await churchRef
      .collection("children")
      .doc(session.child_id)
      .get();
    const childName = childSnap.exists
      ? `${childSnap.data()!.preferred_name || childSnap.data()!.first_name} ${childSnap.data()!.last_name}`
      : "Unknown";

    return NextResponse.json({
      success: true,
      child_name: childName,
      room_name: session.room_name,
      checked_out_at: now.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/checkin/checkout]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
