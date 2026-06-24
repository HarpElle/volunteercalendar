/**
 * GET /api/admin/checkin/room/[roomId]?church_id=...&date=YYYY-MM-DD
 *
 * Admin-auth'd per-room roster — children currently checked in to the
 * room + the adults (teachers/aides) checked in to staff it. Different
 * from `/api/checkin/room/[roomId]` (kiosk token-auth) in that:
 *
 *   - Auth: Bearer + admin/owner role (vs kiosk's `?token=` checkin_view_token)
 *   - Includes the staffed-adults array (the kiosk endpoint computes
 *     this for the ratio check but doesn't expose it; admin needs to
 *     SEE who's covering the room)
 *   - Medical visibility config is bypassed — admin sees everything,
 *     same pattern as /api/admin/emergency-roster (legally material
 *     access path, audit'd separately if/when surfaced)
 *
 * Wave 10 follow-up (Jason 2026-06-02): backend was built into the
 * kiosk endpoint; admin couldn't drill into a room from the dashboard
 * without spinning up a wall-mount kiosk. This route unblocks
 * /dashboard/checkin/rooms/[roomId]/today.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { resolveChurchServiceDate } from "@/lib/server/checkin-helpers";
import { getChildPrivateMedical } from "@/lib/server/child-medical";
import type { CheckInSession, Person, Room, RoomVolunteerCheckIn } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    // Bearer auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const { roomId } = await params;
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get("church_id");
    const explicitDate = searchParams.get("date");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Role gate: admin/owner, or the provisionable checkin_manager flag
    const membershipSnap = await adminDb
      .doc(`memberships/${uid}_${churchId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const membership = membershipSnap.data()!;
    const role = (membership.role as string) ?? "";
    if (
      role !== "admin" &&
      role !== "owner" &&
      membership.checkin_manager !== true
    ) {
      return NextResponse.json(
        { error: "Admin, owner, or check-in manager access required" },
        { status: 403 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Service date = explicit param, else today in the CHURCH timezone (not
    // UTC). Without this, the evening UTC rollover hid actively checked-in
    // children on this drill-down (Codex P3-7 follow-up).
    const date = await resolveChurchServiceDate(churchRef, explicitDate);

    // Load room
    const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const room = { id: roomId, ...roomSnap.data() } as Room;

    // Children: sessions for this room + date
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "==", date)
      .where("room_id", "==", roomId)
      .get();

    interface ChildRow {
      session_id: string;
      child_id: string;
      child_name: string;
      grade: string | null;
      checked_in_at: string;
      checked_out_at: string | null;
      allergies: string | null;
      medical_notes: string | null;
      medications: string | null;
      primary_guardian_name: string | null;
      primary_guardian_phone: string | null;
    }

    const children: ChildRow[] = [];
    for (const sDoc of sessionsSnap.docs) {
      const session = sDoc.data() as CheckInSession;
      // Load child
      const childSnap = await churchRef
        .collection("people")
        .doc(session.child_id as string)
        .get();
      if (!childSnap.exists) continue;
      const child = childSnap.data() as Person;
      const cp =
        (child as Person & { child_profile?: Record<string, unknown> })
          .child_profile ?? {};

      // Phase 3: allergies/medical_notes/medications live in the private
      // medical subdoc.
      const medical = await getChildPrivateMedical(
        churchRef,
        session.child_id as string,
      );

      // Load household for guardian contact.
      //
      // Codex 2026-06-02 Sev 2 hotfix: unified Households (created via
      // /api/admin/checkin/household) store guardian identity on a
      // linked adult Person doc rather than denormalized fields on the
      // household itself. The household doc's primary_guardian_name /
      // primary_guardian_phone are often null for unified households —
      // legacy checkin_households were the only shape that populated
      // them inline. So we need a three-step resolution:
      //   1. Try household.primary_guardian_name/phone (legacy + some
      //      unified that did denormalize)
      //   2. Fall back to household.primary_guardian_id → load that
      //      Person doc → use its name/phone
      //   3. Fall back to ANY adult Person in the household (the same
      //      pattern /api/checkin/lookup uses to pick the primary
      //      adult — first adult member wins)
      let primaryGuardianName: string | null = null;
      let primaryGuardianPhone: string | null = null;
      if (session.household_id) {
        const householdSnap = await churchRef
          .collection("households")
          .doc(session.household_id as string)
          .get();
        if (householdSnap.exists) {
          const hh = householdSnap.data()!;
          // Step 1: inline fields on the household doc
          primaryGuardianName =
            (hh.primary_guardian_name as string) || null;
          primaryGuardianPhone =
            (hh.primary_guardian_phone as string) || null;

          // Step 2: linked adult Person via primary_guardian_id
          if ((!primaryGuardianName || !primaryGuardianPhone) && hh.primary_guardian_id) {
            try {
              const guardianSnap = await churchRef
                .collection("people")
                .doc(hh.primary_guardian_id as string)
                .get();
              if (guardianSnap.exists) {
                const guardian = guardianSnap.data() as Person;
                if (!primaryGuardianName) {
                  primaryGuardianName =
                    (guardian.name as string) ||
                    [guardian.first_name, guardian.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    null;
                }
                if (!primaryGuardianPhone) {
                  primaryGuardianPhone = guardian.phone || null;
                }
              }
            } catch {
              // continue to step 3
            }
          }

          // Step 3: scan household for any adult Person (mirrors
          // src/app/api/checkin/lookup/route.ts:177's
          // "first adult match" rule).
          if (!primaryGuardianName || !primaryGuardianPhone) {
            try {
              const adultsSnap = await churchRef
                .collection("people")
                .where("household_ids", "array-contains", session.household_id as string)
                .where("person_type", "==", "adult")
                .limit(5)
                .get();
              const adult = adultsSnap.docs
                .map((d) => d.data() as Person)
                .find((p) => p.status !== "inactive");
              if (adult) {
                if (!primaryGuardianName) {
                  primaryGuardianName =
                    (adult.name as string) ||
                    [adult.first_name, adult.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    null;
                }
                if (!primaryGuardianPhone) {
                  primaryGuardianPhone = adult.phone || null;
                }
              }
            } catch {
              // accept the partial result
            }
          }
        }
      }

      children.push({
        session_id: sDoc.id,
        child_id: session.child_id as string,
        child_name:
          ((child as { preferred_name?: string }).preferred_name) ||
          `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() ||
          "Child",
        grade: (cp.grade as string) ?? null,
        checked_in_at: session.checked_in_at,
        checked_out_at: session.checked_out_at ?? null,
        allergies: medical.allergies ?? null,
        medical_notes: medical.medical_notes ?? null,
        medications: medical.medications ?? null,
        primary_guardian_name: primaryGuardianName,
        primary_guardian_phone: primaryGuardianPhone,
      });
    }

    // Adults: roomVolunteerCheckins for this room + date
    const volSnap = await churchRef
      .collection("roomVolunteerCheckins")
      .where("room_id", "==", roomId)
      .where("service_date", "==", date)
      .get();

    interface AdultRow {
      person_id: string;
      person_name: string;
      checked_in_at: string;
      checked_out_at: string | null;
    }

    const adults: AdultRow[] = await Promise.all(
      volSnap.docs.map(async (vDoc) => {
        const v = vDoc.data() as RoomVolunteerCheckIn;
        const personSnap = await churchRef
          .collection("people")
          .doc(v.person_id)
          .get();
        const personName = personSnap.exists
          ? ((personSnap.data() as Person).name as string) ||
            `${(personSnap.data() as Person).first_name ?? ""} ${(personSnap.data() as Person).last_name ?? ""}`.trim() ||
            "Volunteer"
          : "Volunteer";
        return {
          person_id: v.person_id,
          person_name: personName,
          checked_in_at: v.checked_in_at,
          checked_out_at: v.checked_out_at ?? null,
        };
      }),
    );

    const totalCheckedIn = children.filter((c) => !c.checked_out_at).length;
    const totalCheckedOut = children.length - totalCheckedIn;
    const adultsActive = adults.filter((a) => !a.checked_out_at).length;

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        capacity: room.capacity ?? null,
      },
      date,
      children,
      adults,
      totals: {
        children_checked_in: totalCheckedIn,
        children_checked_out: totalCheckedOut,
        adults_present: adultsActive,
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/checkin/room]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
