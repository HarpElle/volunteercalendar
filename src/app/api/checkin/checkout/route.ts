import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { sendSms } from "@/lib/services/sms";
import { timingSafeEqual } from "crypto";
import type { CheckInSession, CheckInAlert } from "@/lib/types";

/**
 * POST /api/checkin/checkout
 * Unauthenticated kiosk/volunteer endpoint — verifies security code and checks out children.
 *
 * Two modes:
 *   1. Session-specific:  { church_id, session_id, security_code }
 *   2. Code-only (kiosk): { church_id, security_code }
 *      → Finds ALL active sessions with matching code today and checks them all out.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { church_id, session_id, security_code, volunteer_user_id } =
      body as {
        church_id: string;
        session_id?: string;
        security_code: string;
        volunteer_user_id?: string;
      };

    if (!church_id || !security_code) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const now = new Date();

    // --- Mode 1: Session-specific checkout ---
    if (session_id) {
      return checkoutSession(churchRef, church_id, session_id, security_code, volunteer_user_id, now);
    }

    // --- Mode 2: Code-only kiosk checkout ---
    const today = now.toISOString().split("T")[0];
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "==", today)
      .where("security_code", "==", security_code.toUpperCase())
      .get();

    if (sessionsSnap.empty) {
      return NextResponse.json(
        { error: "no_active_sessions", message: "No children found with this code." },
        { status: 404 },
      );
    }

    // Filter to only active (not yet checked out) sessions
    const activeSessions = sessionsSnap.docs.filter(
      (doc) => !doc.data().checked_out_at,
    );

    if (activeSessions.length === 0) {
      return NextResponse.json(
        { error: "no_active_sessions", message: "All children with this code are already checked out." },
        { status: 409 },
      );
    }

    // Check code expiry on the first session (all share the same expiry)
    const firstSession = activeSessions[0].data() as CheckInSession;
    if (new Date(firstSession.security_code_expires_at) < now) {
      const alertId = adminDb.collection("_").doc().id;
      const alert: CheckInAlert = {
        id: alertId,
        church_id,
        session_id: activeSessions[0].id,
        child_id: firstSession.child_id,
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

    // Batch checkout all active sessions
    const batch = adminDb.batch();
    const childIds: string[] = [];

    for (const doc of activeSessions) {
      batch.update(doc.ref, {
        checked_out_at: now.toISOString(),
        checked_out_by_user_id: volunteer_user_id || null,
      });
      childIds.push(doc.data().child_id);
    }
    await batch.commit();

    // Load child names
    const childDocs = await Promise.all(
      childIds.map((id) => churchRef.collection("children").doc(id).get()),
    );

    const children = childDocs.map((snap, i) => {
      const data = snap.exists ? snap.data()! : {};
      return {
        child_name: snap.exists
          ? `${data.preferred_name || data.first_name} ${data.last_name}`
          : "Unknown",
        room_name: activeSessions[i].data().room_name || "Unknown",
      };
    });

    // Guardian SMS on checkout (fire-and-forget)
    if (activeSessions.length > 0) {
      const householdId = activeSessions[0].data().household_id;
      if (householdId) {
        sendGuardianCheckoutSms(churchRef, church_id, householdId, children).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      children,
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

/**
 * Session-specific checkout with timing-safe code verification.
 */
async function checkoutSession(
  churchRef: FirebaseFirestore.DocumentReference,
  churchId: string,
  sessionId: string,
  securityCode: string,
  volunteerUserId: string | undefined,
  now: Date,
) {
  const sessionSnap = await churchRef
    .collection("checkInSessions")
    .doc(sessionId)
    .get();

  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const session = sessionSnap.data() as CheckInSession;

  if (session.checked_out_at) {
    return NextResponse.json({ error: "Already checked out" }, { status: 409 });
  }

  if (new Date(session.security_code_expires_at) < now) {
    const alertId = adminDb.collection("_").doc().id;
    const alert: CheckInAlert = {
      id: alertId,
      church_id: churchId,
      session_id: sessionId,
      child_id: session.child_id,
      alert_type: "expired_code",
      attempted_code: securityCode,
      occurred_at: now.toISOString(),
      resolved: false,
    };
    await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

    return NextResponse.json(
      { error: "code_expired", message: "Security code has expired. Please see a staff member." },
      { status: 403 },
    );
  }

  const codeA = Buffer.from(securityCode.toUpperCase().padEnd(4));
  const codeB = Buffer.from(session.security_code.toUpperCase().padEnd(4));
  const codesMatch = codeA.length === codeB.length && timingSafeEqual(codeA, codeB);

  if (!codesMatch) {
    const alertId = adminDb.collection("_").doc().id;
    const alert: CheckInAlert = {
      id: alertId,
      church_id: churchId,
      session_id: sessionId,
      child_id: session.child_id,
      alert_type: "wrong_code",
      attempted_code: securityCode,
      occurred_at: now.toISOString(),
      resolved: false,
    };
    await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

    return NextResponse.json(
      { error: "code_mismatch", message: "Security code does not match." },
      { status: 403 },
    );
  }

  await churchRef.collection("checkInSessions").doc(sessionId).update({
    checked_out_at: now.toISOString(),
    checked_out_by_user_id: volunteerUserId || null,
  });

  const childSnap = await churchRef
    .collection("children")
    .doc(session.child_id)
    .get();
  const childName = childSnap.exists
    ? `${childSnap.data()!.preferred_name || childSnap.data()!.first_name} ${childSnap.data()!.last_name}`
    : "Unknown";

  const children = [{ child_name: childName, room_name: session.room_name }];

  // Guardian SMS on checkout (fire-and-forget)
  if (session.household_id) {
    sendGuardianCheckoutSms(churchRef, churchId, session.household_id, children).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    children,
    checked_out_at: now.toISOString(),
  });
}

/**
 * Fire-and-forget guardian SMS on checkout.
 * Loads settings + household phone; skips silently if disabled or missing.
 */
async function sendGuardianCheckoutSms(
  churchRef: FirebaseFirestore.DocumentReference,
  churchId: string,
  householdId: string,
  children: { child_name: string; room_name: string }[],
) {
  const settingsSnap = await churchRef
    .collection("checkinSettings")
    .doc("config")
    .get();
  if (!settingsSnap.exists || !settingsSnap.data()!.guardian_sms_on_checkout) return;

  const householdSnap = await churchRef
    .collection("checkin_households")
    .doc(householdId)
    .get();
  if (!householdSnap.exists) return;

  const phone = householdSnap.data()!.primary_guardian_phone as string | undefined;
  if (!phone) return;

  const nameList = children.map((c) => c.child_name).join(", ");
  const roomList = [...new Set(children.map((c) => c.room_name))].join(", ");
  await sendSms({
    to: phone,
    body: `${nameList} has been checked out from ${roomList}.`,
  });
}
