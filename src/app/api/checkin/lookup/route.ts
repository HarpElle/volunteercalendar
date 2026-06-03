import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, kioskActor } from "@/lib/server/audit";
import { assignRoomByGrade, type AssignedRoom } from "@/lib/server/checkin-helpers";
import type { CheckInHousehold, Child, Person, UnifiedHousehold } from "@/lib/types";

/**
 * POST /api/checkin/lookup
 * Kiosk endpoint — looks up a family by QR token, phone last 4, or full phone.
 *
 * Requires a valid X-Kiosk-Token header (see src/lib/server/authz.ts). Track B
 * replaces the bootstrap token with per-station tokens in `kiosk_tokens`.
 *
 * Reads from the unified `people` collection when available, falling back to
 * the legacy `checkin_households` + `children` collections for backward compat.
 */
export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "lookup");
  if (kiosk instanceof NextResponse) return kiosk;

  // Track D.5: distributed rate limit, keyed on the kiosk station id when
  // available so an attacker can't spread their volume across a million IPs.
  // Falls back to in-memory limiter if Upstash isn't configured.
  const limited = await rateLimitDistributed(req, {
    prefix: "kiosk-lookup",
    limit: 20,
    windowSeconds: 60,
    extraKey: kiosk.station_id ?? undefined,
  });
  if (limited) return limited;

  try {
    // Pass G Phase 1: tier-gate the target church (kiosk token covers auth).
    // Helper must run before req.json() so its req.clone() has an unread body.
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;
    const { churchId: church_id } = gate.ctx;

    const body = await req.json();
    const { qr_token, phone_last4, phone_full, household_id } = body;

    const churchMismatch = assertKioskChurchMatch(kiosk, church_id);
    if (churchMismatch) return churchMismatch;

    // Codex Wave 7 Row 5: audit the household lookup (the matrix expects a
    // kiosk.lookup entry). Fire-and-forget; gated on a real search param so we
    // don't log the empty/invalid 400 case.
    if (qr_token || phone_last4 || phone_full || household_id) {
      void audit({
        church_id,
        actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
        action: "kiosk.lookup",
        target_type: "checkin_household_lookup",
        target_id: church_id,
        metadata: {
          // W10-5A-UI C: "wallet_pass" distinguishes the wallet-scan
          // path from generic household_id lookups (we don't expose
          // any non-wallet path that produces household_id today,
          // but the metadata stays specific for future-proofing).
          method: household_id
            ? "wallet_pass"
            : qr_token
              ? "qr_token"
              : phone_last4
                ? "phone_last4"
                : "phone_full",
        },
        outcome: "ok",
      });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Detect whether unified `people` collection is populated
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnifiedPeople = !peopleSample.empty;

    if (useUnifiedPeople) {
      return handleUnifiedLookup(churchRef, church_id, { qr_token, phone_last4, phone_full, household_id });
    }
    return handleLegacyLookup(churchRef, { qr_token, phone_last4, phone_full, household_id });
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
  params: {
    qr_token?: string;
    phone_last4?: string;
    phone_full?: string;
    household_id?: string;
  },
) {
  const { qr_token, phone_last4, phone_full, household_id } = params;
  const peopleRef = churchRef.collection("people");

  // Step 1: Find a matching adult person
  let matchedPeople: Person[] = [];

  if (household_id) {
    // W10-5A-UI C: wallet-pass scan path. The QR encodes the
    // household_id directly; resolve to people by querying for any
    // person who lists that household. The downstream expansion
    // (Step 2) reads household_ids[0]/etc and returns the full
    // family payload, so we just need at least one matched person
    // to seed the pipeline.
    const snap = await peopleRef
      .where("household_ids", "array-contains", household_id)
      .get();
    matchedPeople = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person);
  } else if (qr_token) {
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

      // Resolve room names for children — preset default_room_id first, then
      // fall back to grade-based room matching so the kiosk pre-check-in
      // screen shows the same room the check-in route will assign.
      const roomIds = [...new Set(children.map((c) => c.child_profile?.default_room_id).filter(Boolean) as string[])];
      const roomNames: Record<string, string> = {};
      for (const rid of roomIds) {
        const roomSnap = await churchRef.collection("rooms").doc(rid).get();
        if (roomSnap.exists) roomNames[rid] = roomSnap.data()!.name;
      }
      const today = new Date().toISOString().split("T")[0];
      const gradeRoomCache = new Map<string, AssignedRoom | null>();
      async function resolveGradeRoom(grade: string | undefined): Promise<AssignedRoom | null> {
        if (!grade) return null;
        const key = grade.toLowerCase();
        if (gradeRoomCache.has(key)) return gradeRoomCache.get(key) ?? null;
        const room = await assignRoomByGrade(churchRef, grade, today);
        gradeRoomCache.set(key, room);
        return room;
      }
      const gradeRooms: Record<string, AssignedRoom | null> = {};
      for (const c of children) {
        const cp = c.child_profile;
        if (cp?.default_room_id) continue; // explicit room wins
        if (!cp?.grade) continue;
        gradeRooms[c.id] = await resolveGradeRoom(cp.grade as string);
      }

      // Check for today's pre-check-in sessions
      const preCheckSnap = await churchRef
        .collection("checkInSessions")
        .where("household_id", "==", hhId)
        .where("service_date", "==", today)
        .where("pre_checked_in", "==", true)
        .get();
      const preCheckedChildIds = preCheckSnap.docs.map((d) => d.data().child_id);

      // Discreet blocked-pickup awareness (Jason 2026-06-02): mirror the
      // `has_alerts` boolean pattern so the kiosk renders a small badge
      // on the child card. Boolean only — names/reasons stay on the
      // checkout-side BlockedPickupReview modal (the legally-material
      // gate). Lookup is the most rate-vulnerable surface, so we keep
      // payload minimal here.
      const blockedChildIds = new Set<string>();
      try {
        const [hhBlockedSnap, childBlockedSnap] = await Promise.all([
          churchRef
            .collection("checkin_blocked_pickups")
            .where("household_id", "==", hhId)
            .get(),
          children.length > 0
            ? churchRef
                .collection("checkin_blocked_pickups")
                .where("child_id", "in", children.slice(0, 10).map((c) => c.id))
                .get()
            : Promise.resolve(null),
        ]);
        if (!hhBlockedSnap.empty) {
          for (const c of children) blockedChildIds.add(c.id);
        }
        if (childBlockedSnap && !childBlockedSnap.empty) {
          for (const d of childBlockedSnap.docs) {
            const cid = d.data().child_id as string | undefined;
            if (cid) blockedChildIds.add(cid);
          }
        }
      } catch {
        // Don't let a lookup-time block query failure 500 the lookup
        // itself; checkout-side BlockedPickupReview remains the
        // legally-material gate.
      }

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
          const presetRoomName = cp?.default_room_id
            ? roomNames[cp.default_room_id] || null
            : null;
          const gradeRoom = gradeRooms[c.id];
          // Track B.4: do NOT include allergies / medical_notes in lookup
          // responses. Lookup is the kiosk's "find this family" call and is
          // the most rate-vulnerable surface. Reveal sensitive details only
          // after the operator selects a specific child via /checkin
          // (which audits the access via kiosk.medical_data_revealed).
          return {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            preferred_name: c.preferred_name,
            grade: cp?.grade,
            photo_url: c.photo_url || cp?.photo_url,
            default_room_id: cp?.default_room_id || gradeRoom?.id || null,
            has_alerts: cp?.has_alerts || false,
            // allergies + medical_notes intentionally omitted; clients use
            // has_alerts as the boolean indicator and request details from
            // /checkin once the operator has confirmed the child.
            // W10 Jason 2026-06-02: discreet operator-awareness flag.
            has_blocked_pickup: blockedChildIds.has(c.id),
            room_name: presetRoomName || gradeRoom?.name || null,
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
  params: {
    qr_token?: string;
    phone_last4?: string;
    phone_full?: string;
    household_id?: string;
  },
) {
  const { qr_token, phone_last4, phone_full, household_id } = params;
  const householdsRef = churchRef.collection("checkin_households");

  let matchedHouseholds: { household: CheckInHousehold; matched_guardian: "primary" | "secondary" }[] = [];

  if (household_id) {
    // W10-5A-UI C: wallet-pass scan path on legacy households. Wallet
    // pass QRs encode the household_id from the (unified) `households`
    // doc, NOT the legacy `checkin_households` doc id. So a direct
    // doc fetch by id won't match unless the IDs happen to be the
    // same. We use the unified-household qr_token as the bridge:
    // fetch the unified household, then find the legacy household
    // with the matching qr_token.
    const unifiedSnap = await churchRef
      .collection("households")
      .doc(household_id)
      .get();
    const bridgeToken = unifiedSnap.exists
      ? ((unifiedSnap.data()?.qr_token as string | undefined) ?? null)
      : null;
    if (bridgeToken) {
      const snap = await householdsRef
        .where("qr_token", "==", bridgeToken)
        .limit(1)
        .get();
      matchedHouseholds = snap.docs.map((d) => ({
        household: { id: d.id, ...d.data() } as CheckInHousehold,
        matched_guardian: "primary" as const,
      }));
    }
  } else if (qr_token) {
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
          // Track B.4: allergies + medical_notes intentionally not returned.
          // Fetch via /api/checkin/child-alerts after operator selects.
        };
      });

      const roomIds = [...new Set(children.map((c) => c.default_room_id).filter(Boolean) as string[])];
      const roomNames: Record<string, string> = {};
      for (const rid of roomIds) {
        const roomSnap = await churchRef.collection("rooms").doc(rid).get();
        if (roomSnap.exists) roomNames[rid] = roomSnap.data()!.name;
      }

      const today = new Date().toISOString().split("T")[0];

      // Grade-based room fallback for legacy children with no default_room_id.
      const gradeRoomCache = new Map<string, AssignedRoom | null>();
      const gradeRoomsLegacy: Record<string, AssignedRoom | null> = {};
      for (const c of children) {
        if (c.default_room_id) continue;
        if (!c.grade) continue;
        const key = String(c.grade).toLowerCase();
        if (!gradeRoomCache.has(key)) {
          gradeRoomCache.set(
            key,
            await assignRoomByGrade(churchRef, c.grade, today),
          );
        }
        gradeRoomsLegacy[c.id!] = gradeRoomCache.get(key) ?? null;
      }

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
        children: children.map((c) => {
          const gradeRoom = gradeRoomsLegacy[c.id!];
          return {
            ...c,
            default_room_id: c.default_room_id || gradeRoom?.id,
            room_name: c.default_room_id
              ? roomNames[c.default_room_id] || null
              : gradeRoom?.name || null,
            pre_checked_in: preCheckedChildIds.includes(c.id!),
          };
        }),
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
