import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import type { CheckInHousehold, Child, Person, UnifiedHousehold } from "@/lib/types";

/**
 * POST /api/checkin/lookup
 * Unauthenticated kiosk endpoint — looks up a family by QR token, phone last 4, or full phone.
 *
 * Reads from the unified `people` collection when available, falling back to
 * the legacy `checkin_households` + `children` collections for backward compat.
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

    // Detect whether unified `people` collection is populated
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnifiedPeople = !peopleSample.empty;

    if (useUnifiedPeople) {
      return handleUnifiedLookup(churchRef, church_id, { qr_token, phone_last4, phone_full });
    }
    return handleLegacyLookup(churchRef, { qr_token, phone_last4, phone_full });
  } catch (error) {
    console.error("[POST /api/checkin/lookup]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── Unified People Collection Lookup ──────────────────────────────────────

async function handleUnifiedLookup(
  churchRef: FirebaseFirestore.DocumentReference,
  churchId: string,
  params: { qr_token?: string; phone_last4?: string; phone_full?: string },
) {
  const { qr_token, phone_last4, phone_full } = params;
  const peopleRef = churchRef.collection("people");

  // Step 1: Find a matching adult person
  let matchedPeople: Person[] = [];

  if (qr_token) {
    // Try person-level qr_token
    let snap = await peopleRef.where("qr_token", "==", qr_token).limit(1).get();
    if (snap.empty) {
      // Try household-level qr_token
      const hhSnap = await churchRef.collection("households")
        .where("qr_token", "==", qr_token).limit(1).get();
      if (!hhSnap.empty) {
        const hhId = hhSnap.docs[0].id;
        snap = await peopleRef.where("household_ids", "array-contains", hhId).get();
      }
    }
    matchedPeople = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person);
  } else if (phone_last4 && typeof phone_last4 === "string") {
    // Last 4 digits: fetch all adults and filter client-side
    const snap = await peopleRef.where("person_type", "==", "adult").get();
    for (const d of snap.docs) {
      const p = { id: d.id, ...d.data() } as Person;
      if (p.phone?.slice(-4) === phone_last4 || p.search_phones?.some((sp) => sp.slice(-4) === phone_last4)) {
        matchedPeople.push(p);
      }
    }
  } else if (phone_full && typeof phone_full === "string") {
    const digits = phone_full.replace(/\D/g, "");
    const snap = await peopleRef.where("search_phones", "array-contains", digits).limit(5).get();
    matchedPeople = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person);
  } else {
    return NextResponse.json(
      { error: "Provide qr_token, phone_last4, or phone_full" },
      { status: 400 },
    );
  }

  if (matchedPeople.length === 0) {
    return NextResponse.json({ households: [] });
  }

  // Step 2: Expand to full families via household_ids
  const householdIds = [...new Set(matchedPeople.flatMap((p) => p.household_ids))];

  // For each household, get all family members
  const results = await Promise.all(
    householdIds.map(async (hhId) => {
      const [familySnap, hhDoc] = await Promise.all([
        peopleRef.where("household_ids", "array-contains", hhId).get(),
        churchRef.collection("households").doc(hhId).get(),
      ]);
      const familyMembers = familySnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person);
      const household = hhDoc.exists ? ({ id: hhDoc.id, ...hhDoc.data() } as UnifiedHousehold) : null;

      // Find the primary guardian (first adult match)
      const primaryAdult = familyMembers.find((p) => p.person_type === "adult");
      const children = familyMembers.filter((p) => p.person_type === "child" && p.status === "active");

      // Resolve room names for children
      const roomIds = [...new Set(children.map((c) => c.child_profile?.default_room_id).filter(Boolean) as string[])];
      const roomNames: Record<string, string> = {};
      for (const rid of roomIds) {
        const roomSnap = await churchRef.collection("rooms").doc(rid).get();
        if (roomSnap.exists) roomNames[rid] = roomSnap.data()!.name;
      }

      // Check for today's pre-check-in sessions
      const today = new Date().toISOString().split("T")[0];
      const preCheckSnap = await churchRef
        .collection("checkInSessions")
        .where("household_id", "==", hhId)
        .where("service_date", "==", today)
        .where("pre_checked_in", "==", true)
        .get();
      const preCheckedChildIds = preCheckSnap.docs.map((d) => d.data().child_id);

      return {
        household: {
          id: hhId,
          primary_guardian_name: primaryAdult?.name || household?.name || "Unknown",
          secondary_guardian_name: null,
          matched_guardian: "primary" as const,
          primary_guardian_phone_masked: primaryAdult?.phone
            ? `***${primaryAdult.phone.slice(-4)}`
            : null,
        },
        children: children.map((c) => {
          const cp = c.child_profile;
          return {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            preferred_name: c.preferred_name,
            grade: cp?.grade,
            photo_url: c.photo_url || cp?.photo_url,
            default_room_id: cp?.default_room_id,
            has_alerts: cp?.has_alerts || false,
            ...(cp?.has_alerts ? { allergies: cp?.allergies, medical_notes: cp?.medical_notes } : {}),
            room_name: cp?.default_room_id ? roomNames[cp.default_room_id] || null : null,
            pre_checked_in: preCheckedChildIds.includes(c.id),
          };
        }),
      };
    }),
  );

  return NextResponse.json({ households: results });
}

// ─── Legacy CheckInHousehold + Children Lookup ─────────────────────────────

async function handleLegacyLookup(
  churchRef: FirebaseFirestore.DocumentReference,
  params: { qr_token?: string; phone_last4?: string; phone_full?: string },
) {
  const { qr_token, phone_last4, phone_full } = params;
  const householdsRef = churchRef.collection("checkin_households");

  let matchedHouseholds: { household: CheckInHousehold; matched_guardian: "primary" | "secondary" }[] = [];

  if (qr_token) {
    const snap = await householdsRef.where("qr_token", "==", qr_token).limit(1).get();
    matchedHouseholds = snap.docs.map(
      (d) => ({ household: { id: d.id, ...d.data() } as CheckInHousehold, matched_guardian: "primary" as const }),
    );
  } else if (phone_last4 && typeof phone_last4 === "string") {
    const snap = await householdsRef.get();
    for (const d of snap.docs) {
      const h = { id: d.id, ...d.data() } as CheckInHousehold;
      const primaryMatch = h.primary_guardian_phone?.slice(-4) === phone_last4;
      const secondaryMatch = h.secondary_guardian_phone?.slice(-4) === phone_last4;
      if (primaryMatch || secondaryMatch) {
        matchedHouseholds.push({
          household: h,
          matched_guardian: primaryMatch ? "primary" : "secondary",
        });
      }
    }
  } else if (phone_full && typeof phone_full === "string") {
    const normalized = normalizePhone(phone_full);
    const snap = await householdsRef.where("primary_guardian_phone", "==", normalized).limit(5).get();
    matchedHouseholds = snap.docs.map(
      (d) => ({ household: { id: d.id, ...d.data() } as CheckInHousehold, matched_guardian: "primary" as const }),
    );
    if (matchedHouseholds.length === 0) {
      const snap2 = await householdsRef.where("secondary_guardian_phone", "==", normalized).limit(5).get();
      matchedHouseholds = snap2.docs.map(
        (d) => ({ household: { id: d.id, ...d.data() } as CheckInHousehold, matched_guardian: "secondary" as const }),
      );
    }
  } else {
    return NextResponse.json(
      { error: "Provide qr_token, phone_last4, or phone_full" },
      { status: 400 },
    );
  }

  const results = await Promise.all(
    matchedHouseholds.map(async ({ household, matched_guardian }) => {
      const childSnap = await churchRef
        .collection("children")
        .where("household_id", "==", household.id)
        .where("is_active", "==", true)
        .get();

      const children: Partial<Child>[] = childSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          first_name: data.first_name,
          last_name: data.last_name,
          preferred_name: data.preferred_name,
          grade: data.grade,
          photo_url: data.photo_url,
          default_room_id: data.default_room_id,
          has_alerts: data.has_alerts,
          ...(data.has_alerts
            ? { allergies: data.allergies, medical_notes: data.medical_notes }
            : {}),
        };
      });

      const roomIds = [...new Set(children.map((c) => c.default_room_id).filter(Boolean) as string[])];
      const roomNames: Record<string, string> = {};
      for (const rid of roomIds) {
        const roomSnap = await churchRef.collection("rooms").doc(rid).get();
        if (roomSnap.exists) roomNames[rid] = roomSnap.data()!.name;
      }

      const today = new Date().toISOString().split("T")[0];
      const preCheckSnap = await churchRef
        .collection("checkInSessions")
        .where("household_id", "==", household.id)
        .where("service_date", "==", today)
        .where("pre_checked_in", "==", true)
        .get();
      const preCheckedChildIds = preCheckSnap.docs.map((d) => d.data().child_id);

      return {
        household: {
          id: household.id,
          primary_guardian_name: household.primary_guardian_name,
          secondary_guardian_name: household.secondary_guardian_name || null,
          matched_guardian,
          primary_guardian_phone_masked: household.primary_guardian_phone
            ? `***${household.primary_guardian_phone.slice(-4)}`
            : null,
        },
        children: children.map((c) => ({
          ...c,
          room_name: c.default_room_id ? roomNames[c.default_room_id] || null : null,
          pre_checked_in: preCheckedChildIds.includes(c.id!),
        })),
      };
    }),
  );

  return NextResponse.json({ households: results });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
