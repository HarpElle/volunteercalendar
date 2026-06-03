import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import type { CheckInHousehold, Child, Person, UnifiedHousehold } from "@/lib/types";

/**
 * GET /api/guardian/household?token=...&church_id=...
 * Public token-based endpoint — returns household info, children, and recent check-in history.
 *
 * PUT /api/guardian/household
 * Public token-based endpoint — updates guardian names and phone numbers.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = req.nextUrl.searchParams.get("token");
    const churchId = req.nextUrl.searchParams.get("church_id");

    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Load church name
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }
    const churchData = churchSnap.data()!;
    const churchName = churchData.name as string;
    // W11 Sub-PR D: church logo surfaces in the /guardian portal
    // header. Null when no custom logo uploaded.
    const churchLogoUrl =
      (churchData.logo_url as string | null | undefined) ?? null;

    // Find household by QR token. Try the unified `households` collection
    // first (the default since the unified-people migration), fall back
    // to the legacy `checkin_households`. Same dual-shape pattern used
    // by /api/guardian/wallet-pass-url and /api/checkin/lookup.
    //
    // Jason 2026-06-03: Pevensie test household landed in `households`
    // (unified) and the prior single-lookup version 404'd "Invalid token"
    // for every newly-created household, blocking /guardian rendering.
    let householdId: string;
    let unifiedHousehold: UnifiedHousehold | null = null;
    let legacyHousehold: CheckInHousehold | null = null;

    const unifiedSnap = await churchRef
      .collection("households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();
    if (!unifiedSnap.empty) {
      const doc = unifiedSnap.docs[0];
      unifiedHousehold = { id: doc.id, ...doc.data() } as UnifiedHousehold;
      householdId = doc.id;
    } else {
      const legacySnap = await churchRef
        .collection("checkin_households")
        .where("qr_token", "==", token)
        .limit(1)
        .get();
      if (legacySnap.empty) {
        return NextResponse.json(
          { error: "Invalid token" },
          { status: 404 },
        );
      }
      const doc = legacySnap.docs[0];
      legacyHousehold = { id: doc.id, ...doc.data() } as CheckInHousehold;
      householdId = doc.id;
    }

    // Resolve guardian display info. For legacy households the
    // denormalized fields on the doc are authoritative. For unified
    // households, the guardian identity lives on the linked adult
    // Person — use the 3-step fallback chain (inline fields →
    // primary_guardian_id → first adult by household_ids
    // array-contains), same as the admin per-room route.
    let primaryGuardianName: string | null = null;
    let primaryGuardianPhone: string | null = null;
    let secondaryGuardianName: string | null = null;
    let secondaryGuardianPhone: string | null = null;

    if (legacyHousehold) {
      primaryGuardianName = legacyHousehold.primary_guardian_name ?? null;
      primaryGuardianPhone = legacyHousehold.primary_guardian_phone ?? null;
      secondaryGuardianName = legacyHousehold.secondary_guardian_name ?? null;
      secondaryGuardianPhone = legacyHousehold.secondary_guardian_phone ?? null;
    } else if (unifiedHousehold) {
      const hh = unifiedHousehold as UnifiedHousehold & {
        primary_guardian_name?: string;
        primary_guardian_phone?: string;
        primary_guardian_id?: string;
        secondary_guardian_name?: string;
        secondary_guardian_phone?: string;
      };
      // Step 1: any denormalized fields on the household doc
      primaryGuardianName = hh.primary_guardian_name ?? null;
      primaryGuardianPhone = hh.primary_guardian_phone ?? null;
      secondaryGuardianName = hh.secondary_guardian_name ?? null;
      secondaryGuardianPhone = hh.secondary_guardian_phone ?? null;

      // Step 2: primary_guardian_id link
      if ((!primaryGuardianName || !primaryGuardianPhone) && hh.primary_guardian_id) {
        try {
          const gSnap = await churchRef
            .collection("people")
            .doc(hh.primary_guardian_id)
            .get();
          if (gSnap.exists) {
            const g = gSnap.data() as Person;
            if (!primaryGuardianName) {
              primaryGuardianName =
                (g.name as string) ||
                [g.first_name, g.last_name].filter(Boolean).join(" ") ||
                null;
            }
            if (!primaryGuardianPhone) primaryGuardianPhone = g.phone || null;
          }
        } catch { /* continue to step 3 */ }
      }

      // Step 3: scan household for any adult Person
      if (!primaryGuardianName || !primaryGuardianPhone) {
        try {
          const adultsSnap = await churchRef
            .collection("people")
            .where("household_ids", "array-contains", householdId)
            .where("person_type", "==", "adult")
            .limit(5)
            .get();
          const adults = adultsSnap.docs
            .map((d) => d.data() as Person)
            .filter((p) => p.status !== "inactive");
          const primary = adults[0];
          if (primary) {
            if (!primaryGuardianName) {
              primaryGuardianName =
                (primary.name as string) ||
                [primary.first_name, primary.last_name].filter(Boolean).join(" ") ||
                null;
            }
            if (!primaryGuardianPhone) primaryGuardianPhone = primary.phone || null;
          }
          const secondary = adults[1];
          if (secondary && !secondaryGuardianName) {
            secondaryGuardianName =
              (secondary.name as string) ||
              [secondary.first_name, secondary.last_name].filter(Boolean).join(" ") ||
              null;
            if (!secondaryGuardianPhone) secondaryGuardianPhone = secondary.phone || null;
          }
        } catch { /* accept partial result */ }
      }
    }

    // Load children. Legacy shape reads from the `children` collection;
    // unified shape reads from `people` where person_type === "child"
    // and household_ids array-contains the household id.
    let children: Array<{
      id: string;
      first_name: string;
      last_name: string;
      preferred_name?: string;
      grade?: string;
    }> = [];

    if (legacyHousehold) {
      const childrenSnap = await churchRef
        .collection("children")
        .where("household_id", "==", householdId)
        .where("is_active", "==", true)
        .get();
      children = childrenSnap.docs.map((d) => {
        const data = d.data() as Child;
        return {
          id: d.id,
          first_name: data.first_name,
          last_name: data.last_name,
          preferred_name: data.preferred_name,
          grade: data.grade,
        };
      });
    } else if (unifiedHousehold) {
      const childrenSnap = await churchRef
        .collection("people")
        .where("household_ids", "array-contains", householdId)
        .where("person_type", "==", "child")
        .get();
      children = childrenSnap.docs
        .map((d) => {
          const data = d.data() as Person & {
            child_profile?: { grade?: string };
          };
          if (data.status === "inactive") return null;
          return {
            id: d.id,
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            preferred_name: (data as { preferred_name?: string }).preferred_name,
            grade: data.child_profile?.grade,
          };
        })
        .filter(<T>(c: T | null): c is T => c !== null);
    }

    // Load recent check-in sessions (last 30 days). The previous
    // query had `.where("household_id","==",X).where("service_date",
    // ">=",cutoff).orderBy("service_date","desc")` which requires a
    // composite index on (household_id, service_date) that hasn't
    // been deployed — Firestore threw FAILED_PRECONDITION and the
    // endpoint 500'd, blocking the portal page from rendering at all.
    //
    // Fix: query by household_id only (single-field index already
    // exists), then filter the date cutoff + sort + limit in memory.
    // The total session count per household is small (rarely >100),
    // so the in-process work is cheap.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("household_id", "==", householdId)
      .get();

    const sessions = sessionsSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          child_id: data.child_id as string,
          service_date: data.service_date as string,
          room_name: data.room_name as string,
          checked_in_at: data.checked_in_at as string,
          checked_out_at: (data.checked_out_at as string | null) || null,
        };
      })
      .filter((s) => s.service_date >= cutoffDate)
      .sort((a, b) => b.service_date.localeCompare(a.service_date))
      .slice(0, 50);

    return NextResponse.json({
      church_name: churchName,
      church_logo_url: churchLogoUrl,
      household: {
        id: householdId,
        primary_guardian_name: primaryGuardianName,
        primary_guardian_phone: primaryGuardianPhone
          ? `***${primaryGuardianPhone.slice(-4)}`
          : null,
        secondary_guardian_name: secondaryGuardianName,
        secondary_guardian_phone: secondaryGuardianPhone
          ? `***${secondaryGuardianPhone.slice(-4)}`
          : null,
      },
      children,
      sessions,
    });
  } catch (error) {
    console.error("[GET /api/guardian/household]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { token, church_id, primary_guardian_name, primary_guardian_phone,
            secondary_guardian_name, secondary_guardian_phone } = body as {
      token: string;
      church_id: string;
      primary_guardian_name?: string;
      primary_guardian_phone?: string;
      secondary_guardian_name?: string;
      secondary_guardian_phone?: string;
    };

    if (!token || !church_id) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Find household by QR token
    const householdsSnap = await churchRef
      .collection("checkin_households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();

    if (householdsSnap.empty) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 },
      );
    }

    const householdDoc = householdsSnap.docs[0];

    // Only allow updating guardian names and phones
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (primary_guardian_name !== undefined) {
      updates.primary_guardian_name = primary_guardian_name.trim();
    }
    if (primary_guardian_phone !== undefined) {
      updates.primary_guardian_phone = normalizePhone(primary_guardian_phone);
    }
    if (secondary_guardian_name !== undefined) {
      updates.secondary_guardian_name = secondary_guardian_name.trim() || null;
    }
    if (secondary_guardian_phone !== undefined) {
      updates.secondary_guardian_phone = secondary_guardian_phone
        ? normalizePhone(secondary_guardian_phone)
        : null;
    }

    await churchRef
      .collection("checkin_households")
      .doc(householdDoc.id)
      .update(updates);

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("[PUT /api/guardian/household]", error);
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
