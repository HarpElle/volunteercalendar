import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { generateSecurityCode } from "@/lib/utils/security-code";
import { getPrinterAdapter } from "@/lib/services/printing";
import { sendSms } from "@/lib/services/sms";
import type {
  CheckInSession,
  LabelJob,
  LabelPayload,
  PrinterConfig,
} from "@/lib/types";

/**
 * POST /api/checkin/checkin
 * Unauthenticated kiosk endpoint — checks in children and generates label payloads.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const {
      church_id,
      household_id,
      child_ids,
      room_overrides,
      station_id,
      service_date,
      service_id,
      alerts_acknowledged,
    } = body as {
      church_id: string;
      household_id: string;
      child_ids: string[];
      room_overrides?: Record<string, string>;
      station_id?: string;
      service_date: string;
      service_id?: string;
      alerts_acknowledged?: boolean;
    };

    if (!church_id || !household_id || !child_ids?.length || !service_date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Load church doc for name
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }
    const churchName = churchSnap.data()!.name as string;

    // Load check-in settings for printer config + service times
    const settingsSnap = await churchRef
      .collection("checkinSettings")
      .doc("config")
      .get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : null;

    // Load household for guardian phone (used for SMS)
    let guardianPhone: string | null = null;
    let isFirstSms = false;
    if (settings?.guardian_sms_on_checkin) {
      const householdSnap = await churchRef
        .collection("checkin_households")
        .doc(household_id)
        .get();
      if (householdSnap.exists) {
        const hData = householdSnap.data()!;
        guardianPhone = (hData.primary_guardian_phone as string) || null;
        isFirstSms = !hData.first_sms_sent;
      }
    }

    // Find the printer for this station
    let printerConfig: PrinterConfig | null = null;
    if (settings?.printers?.length) {
      const printers = settings.printers as PrinterConfig[];
      if (station_id) {
        printerConfig =
          printers.find((p) => p.id === station_id && p.is_active) || null;
      }
      if (!printerConfig) {
        printerConfig = printers.find((p) => p.is_active) || null;
      }
    }

    // Calculate security code expiry (service end time + 2hr, or end of day)
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(23, 59, 59, 999); // Default: end of day
    // If we have service times, use the latest end time + 2hr
    if (settings?.service_times?.length) {
      const dayOfWeek = new Date(service_date + "T12:00:00").getDay();
      const todayServices = (
        settings.service_times as { day_of_week: number; end_time: string; is_active: boolean }[]
      ).filter(
        (st) => st.day_of_week === dayOfWeek && st.is_active,
      );
      if (todayServices.length) {
        const latestEnd = todayServices
          .map((st) => st.end_time)
          .sort()
          .pop()!;
        const [h, m] = latestEnd.split(":").map(Number);
        expiresAt.setHours(h + 2, m, 0, 0);
      }
    }

    // Generate one shared security code for this check-in group
    const securityCode = generateSecurityCode();

    // Process each child
    const sessions: CheckInSession[] = [];
    const labelPayloads: LabelPayload[] = [];
    const childNames: string[] = [];
    let anyAlerts = false;

    for (const childId of child_ids) {
      const childSnap = await churchRef
        .collection("children")
        .doc(childId)
        .get();
      if (!childSnap.exists) continue;
      const child = childSnap.data()!;

      // Resolve room
      let roomId: string | null =
        room_overrides?.[childId] || child.default_room_id || null;
      let roomName = "Unassigned";
      let roomCapacity: number | undefined;
      let overflowRoomId: string | undefined;

      if (roomId) {
        const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
        if (roomSnap.exists) {
          const roomData = roomSnap.data()!;
          roomName = roomData.name;
          roomCapacity = roomData.capacity;
          overflowRoomId = roomData.overflow_room_id;
        }
      }

      // Check room capacity + auto-redirect to overflow if available
      if (roomId && roomCapacity) {
        const currentCount = await churchRef
          .collection("checkInSessions")
          .where("service_date", "==", service_date)
          .where("room_id", "==", roomId)
          .where("checked_out_at", "==", null)
          .count()
          .get();
        const count = currentCount.data().count;

        if (count >= roomCapacity) {
          // Auto-redirect to overflow room if configured
          if (overflowRoomId) {
            const overflowSnap = await churchRef
              .collection("rooms")
              .doc(overflowRoomId)
              .get();
            if (overflowSnap.exists) {
              roomId = overflowRoomId;
              roomName = overflowSnap.data()!.name;
            }
          }

          // Capacity SMS (non-blocking)
          if (settings?.capacity_sms_recipient_phone) {
            await sendSms({
              to: settings.capacity_sms_recipient_phone,
              body: `[${churchName}] Check-In: ${roomName} has reached capacity (${count}/${roomCapacity}). Consider redirecting. – VolunteerCal`,
            }).catch(() => {});
          }
        }
      }

      const displayName = child.preferred_name || child.first_name;
      const fullName = `${displayName} ${child.last_name}`;
      childNames.push(displayName);

      if (child.has_alerts) anyAlerts = true;

      // Create CheckInSession document
      const sessionId = adminDb
        .collection("_")
        .doc().id;
      const session: CheckInSession = {
        id: sessionId,
        church_id,
        child_id: childId,
        household_id,
        service_date,
        service_id: service_id || undefined,
        room_id: roomId || "",
        room_name: roomName,
        security_code: securityCode,
        security_code_expires_at: expiresAt.toISOString(),
        checked_in_at: now.toISOString(),
        pre_checked_in: false,
        alerts_acknowledged: !!alerts_acknowledged,
        alert_snapshot:
          child.has_alerts
            ? [child.allergies, child.medical_notes]
                .filter(Boolean)
                .join(" | ")
            : undefined,
        created_at: now.toISOString(),
      };

      await churchRef
        .collection("checkInSessions")
        .doc(sessionId)
        .set(session);
      sessions.push(session);

      // Generate child label
      if (printerConfig) {
        const labelJob: LabelJob = {
          type: "child_label",
          child_name: fullName,
          room_name: roomName,
          service_date: formatDateForLabel(service_date),
          security_code: securityCode,
          church_name: churchName,
          has_allergy_alert: child.has_alerts,
          allergy_text: child.allergies || undefined,
        };
        try {
          const adapter = getPrinterAdapter(printerConfig.printer_type);
          const payload = await adapter.generateLabel(labelJob, printerConfig);
          labelPayloads.push(payload);
        } catch {
          // Label generation failure — non-blocking
        }
      }
    }

    // Generate parent stub (one per family group)
    if (printerConfig && childNames.length > 0) {
      const stubJob: LabelJob = {
        type: "parent_stub",
        child_names: childNames,
        service_date: formatDateForLabel(service_date),
        security_code: securityCode,
        church_name: churchName,
        has_allergy_alert: anyAlerts,
      };
      try {
        const adapter = getPrinterAdapter(printerConfig.printer_type);
        const payload = await adapter.generateLabel(stubJob, printerConfig);
        labelPayloads.push(payload);
      } catch {
        // Non-blocking
      }
    }

    // Guardian SMS — fire-and-forget (non-blocking)
    if (settings?.guardian_sms_on_checkin && guardianPhone) {
      const roomList = [...new Set(sessions.map((s) => s.room_name))].join(", ");
      const nameList = childNames.join(", ");
      let smsBody = `${nameList} checked in to ${roomList}. Security code: ${securityCode}`;

      // On first SMS, append vCard download link so guardian can save the contact
      if (isFirstSms) {
        const origin = req.headers.get("origin") || req.nextUrl.origin;
        smsBody += ` Save this contact: ${origin}/api/checkin/vcard?church_id=${church_id}`;
      }

      sendSms({ to: guardianPhone, body: smsBody }).catch(() => {});

      // Mark first SMS sent (fire-and-forget)
      if (isFirstSms) {
        churchRef
          .collection("checkin_households")
          .doc(household_id)
          .update({ first_sms_sent: true })
          .catch(() => {});
      }
    }

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        child_id: s.child_id,
        room_name: s.room_name,
        checked_in_at: s.checked_in_at,
      })),
      security_code: securityCode,
      label_payloads: labelPayloads,
      print_server_url: printerConfig?.print_server_url || null,
    });
  } catch (error) {
    console.error("[POST /api/checkin/checkin]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function formatDateForLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
