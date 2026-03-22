import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import type { CheckInHousehold, Child } from "@/lib/types";

/**
 * POST /api/checkin/lookup
 * Unauthenticated kiosk endpoint — looks up a family by QR token, phone last 4, or full phone.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { church_id, qr_token, phone_last4, phone_full } = body;

    if (!church_id) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const householdsRef = churchRef.collection("checkin_households");

    let matchedHouseholds: CheckInHousehold[] = [];

    if (qr_token) {
      // QR token lookup — exact match, returns 0 or 1
      const snap = await householdsRef
        .where("qr_token", "==", qr_token)
        .limit(1)
        .get();
      matchedHouseholds = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CheckInHousehold,
      );
    } else if (phone_last4 && typeof phone_last4 === "string") {
      // Last 4 digits — fetch all households for church and filter
      const snap = await householdsRef.get();
      matchedHouseholds = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as CheckInHousehold)
        .filter((h) => {
          const primary = h.primary_guardian_phone?.slice(-4);
          const secondary = h.secondary_guardian_phone?.slice(-4);
          return primary === phone_last4 || secondary === phone_last4;
        });
    } else if (phone_full && typeof phone_full === "string") {
      // Full phone — normalize and match
      const normalized = normalizePhone(phone_full);
      const snap = await householdsRef
        .where("primary_guardian_phone", "==", normalized)
        .limit(5)
        .get();
      matchedHouseholds = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CheckInHousehold,
      );

      // Also check secondary phone if no match on primary
      if (matchedHouseholds.length === 0) {
        const snap2 = await householdsRef
          .where("secondary_guardian_phone", "==", normalized)
          .limit(5)
          .get();
        matchedHouseholds = snap2.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as CheckInHousehold,
        );
      }
    } else {
      return NextResponse.json(
        { error: "Provide qr_token, phone_last4, or phone_full" },
        { status: 400 },
      );
    }

    // Fetch children for each matched household
    const results = await Promise.all(
      matchedHouseholds.map(async (household) => {
        const childSnap = await churchRef
          .collection("children")
          .where("household_id", "==", household.id)
          .where("is_active", "==", true)
          .get();

        const children: Partial<Child>[] = childSnap.docs.map((d) => {
          const data = d.data();
          // Data minimization: only return fields needed for kiosk display
          return {
            id: d.id,
            first_name: data.first_name,
            last_name: data.last_name,
            preferred_name: data.preferred_name,
            grade: data.grade,
            photo_url: data.photo_url,
            default_room_id: data.default_room_id,
            has_alerts: data.has_alerts,
            // No allergies/medical_notes in lookup — only shown at allergy confirm screen
          };
        });

        // Resolve room names for children
        const roomIds = [
          ...new Set(
            children
              .map((c) => c.default_room_id)
              .filter(Boolean) as string[],
          ),
        ];
        const roomNames: Record<string, string> = {};
        for (const rid of roomIds) {
          const roomSnap = await churchRef.collection("rooms").doc(rid).get();
          if (roomSnap.exists) {
            roomNames[rid] = roomSnap.data()!.name;
          }
        }

        // Check for today's pre-check-in sessions
        const today = new Date().toISOString().split("T")[0];
        const preCheckSnap = await churchRef
          .collection("checkInSessions")
          .where("household_id", "==", household.id)
          .where("service_date", "==", today)
          .where("pre_checked_in", "==", true)
          .get();
        const preCheckedChildIds = preCheckSnap.docs.map(
          (d) => d.data().child_id,
        );

        return {
          household: {
            id: household.id,
            primary_guardian_name: household.primary_guardian_name,
            // Mask phone: show only last 4 digits
            primary_guardian_phone_masked: household.primary_guardian_phone
              ? `***${household.primary_guardian_phone.slice(-4)}`
              : null,
          },
          children: children.map((c) => ({
            ...c,
            room_name: c.default_room_id
              ? roomNames[c.default_room_id] || null
              : null,
            pre_checked_in: preCheckedChildIds.includes(c.id!),
          })),
        };
      }),
    );

    return NextResponse.json({ households: results });
  } catch (error) {
    console.error("[POST /api/checkin/lookup]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
