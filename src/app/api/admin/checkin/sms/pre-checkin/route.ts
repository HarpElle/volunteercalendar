import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { sendSms } from "@/lib/services/sms";
import { TIER_LIMITS } from "@/lib/constants";
import type { CheckInSettings, CheckInServiceTime } from "@/lib/types";

/**
 * POST /api/admin/checkin/sms/pre-checkin
 *
 * Sends pre-check-in SMS to all active households for an upcoming service.
 * Gated to Pro+ tier (checkin_pre_checkin_sms).
 *
 * Body: { church_id }
 *
 * Logic:
 * 1. Find the next service time within the pre_checkin_window_minutes window.
 * 2. Query all active households with a phone number.
 * 3. Send each household a text with their children's names and a QR deep-link.
 * 4. Return counts of sent/skipped/failed.
 *
 * Designed to be called by a cron job (e.g., every 15 minutes) or manually
 * from the admin dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership + admin role
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Check tier
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const tier = (churchSnap.data()!.subscription_tier || "free") as keyof typeof TIER_LIMITS;
    const limits = TIER_LIMITS[tier];
    if (!limits?.checkin_pre_checkin_sms) {
      return NextResponse.json(
        { error: "Pre-check-in SMS requires Pro tier or higher" },
        { status: 403 },
      );
    }

    // Load check-in settings
    const settingsSnap = await adminDb
      .doc(`churches/${church_id}/checkinSettings/config`)
      .get();
    if (!settingsSnap.exists) {
      return NextResponse.json(
        { error: "Check-in settings not configured" },
        { status: 400 },
      );
    }
    const settings = settingsSnap.data() as CheckInSettings;

    // Find the next upcoming service within the pre-check-in window
    const now = new Date();
    const windowMinutes = settings.pre_checkin_window_minutes || 60;
    const matchingService = findUpcomingService(
      settings.service_times,
      now,
      windowMinutes,
    );

    if (!matchingService) {
      return NextResponse.json({
        status: "no_service",
        message: `No service found within the next ${windowMinutes} minutes`,
        sent: 0,
        skipped: 0,
        failed: 0,
      });
    }

    // Get church name for SMS body
    const churchName = churchSnap.data()!.name || "Your church";

    // Track which households have already received SMS today for this service
    const today = now.toISOString().split("T")[0];
    const sentKey = `pre_checkin_sms_${today}_${matchingService.id}`;

    // Query all active households
    const householdsSnap = await adminDb
      .collection(`churches/${church_id}/checkin_households`)
      .where("is_active", "==", true)
      .get();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of householdsSnap.docs) {
      const household = doc.data();
      const phone = household.primary_guardian_phone;
      if (!phone) {
        skipped++;
        continue;
      }

      // Skip if already sent for this service today
      if (household[sentKey]) {
        skipped++;
        continue;
      }

      // Get children names for this household
      const childrenSnap = await adminDb
        .collection(`churches/${church_id}/children`)
        .where("household_id", "==", doc.id)
        .where("is_active", "==", true)
        .get();

      if (childrenSnap.empty) {
        skipped++;
        continue;
      }

      const childNames = childrenSnap.docs
        .map((c) => c.data().preferred_name || c.data().first_name)
        .join(", ");

      const qrToken = household.qr_token;
      const message = buildSmsBody(
        churchName,
        matchingService,
        childNames,
        qrToken,
      );

      const result = await sendSms({ to: phone, body: message });

      if (result.success) {
        sent++;
        // Mark as sent so we don't re-send
        await doc.ref.update({ [sentKey]: new Date().toISOString() });
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      status: "complete",
      service: matchingService.name,
      sent,
      skipped,
      failed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * Find the next service time that falls within windowMinutes from now.
 */
function findUpcomingService(
  serviceTimes: CheckInServiceTime[],
  now: Date,
  windowMinutes: number,
): CheckInServiceTime | null {
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const windowEnd = currentMinutes + windowMinutes;

  for (const st of serviceTimes) {
    if (!st.is_active) continue;
    if (st.day_of_week !== currentDay) continue;

    const [h, m] = st.start_time.split(":").map(Number);
    const serviceMinutes = h * 60 + m;

    // Service starts within the window (hasn't started yet, but will within windowMinutes)
    if (serviceMinutes > currentMinutes && serviceMinutes <= windowEnd) {
      return st;
    }
  }

  return null;
}

/**
 * Build the SMS message body.
 */
function buildSmsBody(
  churchName: string,
  service: CheckInServiceTime,
  childNames: string,
  qrToken: string,
): string {
  return (
    `${churchName} - ${service.name} check-in is opening soon! ` +
    `Your children (${childNames}) are ready to check in. ` +
    `Show this code at the kiosk or scan your family QR card. ` +
    `Token: ${qrToken.slice(0, 8).toUpperCase()}`
  );
}
