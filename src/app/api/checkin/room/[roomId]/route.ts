import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { loadChild, loadHouseholdPhone } from "@/lib/server/checkin-helpers";
import {
  getRosterFieldStates,
  resolveMedicalVisibility,
  type RosterFieldState,
} from "@/lib/server/medical-visibility";
import type { CheckInSession, CheckInSettings } from "@/lib/types";

/**
 * GET /api/checkin/room/[roomId]
 * Token-authenticated teacher room view endpoint.
 * Returns room details + checked-in children for a given date.
 * Auth: query param ?token={checkin_view_token} (not Bearer — for easy iPad bookmarking)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { roomId } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!token) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    // Pass G Phase 1: tier-gate the target church (room token covers auth below).
    const gate = await requireModuleTier(req, "checkin", {
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;
    const { churchId: church_id } = gate.ctx;

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Load room and verify token
    const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = roomSnap.data()!;
    if (room.checkin_view_token !== token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Load check-in settings for service times (to determine late arrivals)
    const settingsSnap = await churchRef
      .collection("checkinSettings")
      .doc("config")
      .get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : null;

    // Find current service start time for late arrival detection
    let currentServiceStart: string | null = null;
    if (settings?.service_times?.length) {
      const dayOfWeek = new Date(date + "T12:00:00").getDay();
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      const todayServices = (
        settings.service_times as {
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_active: boolean;
        }[]
      ).filter((st) => st.day_of_week === dayOfWeek && st.is_active);

      // Find the service whose window contains "now"
      for (const st of todayServices) {
        const [sh, sm] = st.start_time.split(":").map(Number);
        const [eh, em] = st.end_time.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        if (nowMinutes >= startMin && nowMinutes <= endMin) {
          currentServiceStart = st.start_time;
          break;
        }
      }
    }

    const lateThreshold = settings?.late_arrival_threshold_minutes ?? 15;

    // Query checked-in sessions for this room and date
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "==", date)
      .where("room_id", "==", roomId)
      .get();

    // Wave 9 P0-4 sub-PR B: resolve visibility once per request so
    // the per-child rendering loop doesn't re-read settings.
    const visibility = resolveMedicalVisibility(
      settings as Pick<CheckInSettings, "medical_visibility"> | null,
    );

    // Enrich sessions with child data
    const children: {
      session_id: string;
      child_id: string;
      child_name: string;
      grade?: string;
      checked_in_at: string;
      checked_out_at: string | null;
      has_alerts: boolean;
      /** Legacy fields — kept for back-compat readers; new clients
       *  should consume `medical_fields` instead. */
      allergies?: string;
      medical_notes?: string;
      medications?: string;
      /** Wave 9 P0-4 sub-PR B: per-field render plan for the kiosk
       *  roster. Each entry tells the client whether to show the
       *  field at all (`visible`) and whether to gate it behind a
       *  tap-to-reveal placeholder (`requires_tap`). For
       *  tap-gated fields, the value IS sent — the gating is purely
       *  a render decision; the client fires
       *  `kiosk.medical_data_revealed` when the operator taps. */
      medical_fields: RosterFieldState[];
      is_late: boolean;
      parent_phone_masked: string;
    }[] = [];

    for (const doc of sessionsSnap.docs) {
      const session = doc.data() as CheckInSession;

      // Unified-aware child lookup. Before this change, Pro-tier kiosk sessions
      // with Person doc IDs as child_id silently `continue`d here, hiding the
      // child from the teacher room view entirely.
      const child = await loadChild(churchRef, session.child_id);
      if (!child) continue;

      const phone = (await loadHouseholdPhone(churchRef, session.household_id)) || "";
      const maskedPhone = phone.length >= 4 ? `***${phone.slice(-4)}` : "****";

      // Determine if late arrival
      let isLate = false;
      if (currentServiceStart) {
        const [sh, sm] = currentServiceStart.split(":").map(Number);
        const serviceStartMs = new Date(date + "T12:00:00");
        serviceStartMs.setHours(sh, sm, 0, 0);
        const lateMs = serviceStartMs.getTime() + lateThreshold * 60_000;
        const checkinMs = new Date(session.checked_in_at).getTime();
        isLate = checkinMs > lateMs;
      }

      const displayName = child.display_name;
      // Wave 9 P0-4 sub-PR B: prefer the structured snapshot captured
      // at check-in (so a mid-service medical-notes edit doesn't
      // retroactively change what the operator sees on the roster).
      // Fall back to the live child doc for sessions created before
      // the foundation PR shipped.
      const childMedications =
        (child as { medications?: string }).medications;
      const snapshot = session.medical_snapshot ?? {
        allergies: child.allergies ?? null,
        medical_notes: child.medical_notes ?? null,
        medications: childMedications ?? null,
      };
      const medicalFields = getRosterFieldStates(snapshot, visibility);

      children.push({
        session_id: session.id,
        child_id: session.child_id,
        child_name: `${displayName} ${child.last_name}`,
        grade: child.grade,
        checked_in_at: session.checked_in_at,
        checked_out_at: session.checked_out_at || null,
        has_alerts: child.has_alerts,
        // Legacy field exposure kept ONLY for the values the
        // visibility config explicitly allows on the roster. Tap-
        // gated fields are omitted from these — clients consuming
        // the legacy shape get a "no value" for fields that need
        // the tap-to-reveal interaction, matching what they'd see
        // if they used the new `medical_fields` shape.
        allergies: medicalFields.find((f) => f.field === "allergies" && f.visible && !f.requires_tap)
          ?.value ?? undefined,
        medical_notes: medicalFields.find((f) => f.field === "medical_notes" && f.visible && !f.requires_tap)
          ?.value ?? undefined,
        medications: medicalFields.find((f) => f.field === "medications" && f.visible && !f.requires_tap)
          ?.value ?? undefined,
        medical_fields: medicalFields,
        is_late: isLate,
        parent_phone_masked: maskedPhone,
      });
    }

    // Sort: checked-in first (no checkout), then by name
    children.sort((a, b) => {
      if (a.checked_out_at && !b.checked_out_at) return 1;
      if (!a.checked_out_at && b.checked_out_at) return -1;
      return a.child_name.localeCompare(b.child_name);
    });

    return NextResponse.json({
      room: {
        id: roomId,
        name: room.name,
        capacity: room.capacity || null,
      },
      date,
      children,
      total_checked_in: children.filter((c) => !c.checked_out_at).length,
      total_checked_out: children.filter((c) => c.checked_out_at).length,
    });
  } catch (error) {
    console.error("[GET /api/checkin/room]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
