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

      // Step 2: primary_guardian_id link (+ secondary_guardian_id).
      // 2026-06-03 fix: previously only resolved primary. After the
      // household-create flow started setting both pointers, the
      // secondary guardian was being dropped on the Family Portal
      // because step 3 only fired when primary was missing.
      const hhSecondaryId =
        (hh as { secondary_guardian_id?: string }).secondary_guardian_id;
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
      if ((!secondaryGuardianName || !secondaryGuardianPhone) && hhSecondaryId) {
        try {
          const gSnap = await churchRef
            .collection("people")
            .doc(hhSecondaryId)
            .get();
          if (gSnap.exists) {
            const g = gSnap.data() as Person;
            if (!secondaryGuardianName) {
              secondaryGuardianName =
                (g.name as string) ||
                [g.first_name, g.last_name].filter(Boolean).join(" ") ||
                null;
            }
            if (!secondaryGuardianPhone) secondaryGuardianPhone = g.phone || null;
          }
        } catch { /* continue to step 3 */ }
      }

      // Step 3: scan household for any adult Person — fires when
      // either primary OR secondary still has gaps.
      if (
        !primaryGuardianName ||
        !primaryGuardianPhone ||
        !secondaryGuardianName ||
        !secondaryGuardianPhone
      ) {
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
      allergies?: string | null;
      medical_notes?: string | null;
      has_alerts?: boolean;
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
            child_profile?: {
              grade?: string;
              allergies?: string | null;
              medical_notes?: string | null;
              has_alerts?: boolean;
            };
          };
          if (data.status === "inactive") return null;
          const cp = data.child_profile ?? {};
          return {
            id: d.id,
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            preferred_name: (data as { preferred_name?: string }).preferred_name,
            grade: cp.grade,
            // 2026-06-03: surface editable fields so the Family Portal
            // can pre-populate the edit modal without a second fetch.
            // Empty string -> null normalization to match what the
            // PUT endpoint accepts.
            allergies: cp.allergies ?? null,
            medical_notes: cp.medical_notes ?? null,
            has_alerts: cp.has_alerts ?? false,
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
    const now = new Date().toISOString();

    // Dual-shape lookup. Try unified `households` first (the default
    // since the unified-people migration), fall back to legacy
    // `checkin_households`. 2026-06-03 fix: PUT previously only
    // searched checkin_households, so edits from the Family Portal
    // silently no-op'd for any household created post-migration.
    const unifiedSnap = await churchRef
      .collection("households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();

    if (!unifiedSnap.empty) {
      // Unified path — write name/phone to the linked Person docs.
      const hhDoc = unifiedSnap.docs[0];
      const hhData = hhDoc.data();
      const householdId = hhDoc.id;
      const primaryGuardianId =
        typeof hhData.primary_guardian_id === "string"
          ? hhData.primary_guardian_id
          : null;
      const secondaryGuardianId =
        typeof hhData.secondary_guardian_id === "string"
          ? hhData.secondary_guardian_id
          : null;

      // Update primary Person.
      if (
        (primary_guardian_name !== undefined || primary_guardian_phone !== undefined) &&
        primaryGuardianId
      ) {
        const personRef = churchRef.collection("people").doc(primaryGuardianId);
        const updates: Record<string, unknown> = { updated_at: now };
        if (primary_guardian_name !== undefined) {
          const cleaned = primary_guardian_name.trim();
          updates.name = cleaned;
          updates.search_name = cleaned.toLowerCase();
          const parts = cleaned.split(" ");
          updates.first_name = parts[0] || "";
          updates.last_name = parts.slice(1).join(" ") || "";
        }
        if (primary_guardian_phone !== undefined) {
          const np = normalizePhone(primary_guardian_phone);
          updates.phone = np;
          updates.search_phones = [np.replace(/\D/g, "")];
        }
        await personRef.update(updates);
      }

      // Update or create secondary Person.
      if (
        secondary_guardian_name !== undefined ||
        secondary_guardian_phone !== undefined
      ) {
        const wantsSecondary = !!(secondary_guardian_name && secondary_guardian_name.trim());
        if (wantsSecondary && secondaryGuardianId) {
          const personRef = churchRef.collection("people").doc(secondaryGuardianId);
          const updates: Record<string, unknown> = { updated_at: now };
          if (secondary_guardian_name !== undefined) {
            const cleaned = secondary_guardian_name.trim();
            updates.name = cleaned;
            updates.search_name = cleaned.toLowerCase();
            const parts = cleaned.split(" ");
            updates.first_name = parts[0] || "";
            updates.last_name = parts.slice(1).join(" ") || "";
          }
          if (secondary_guardian_phone !== undefined) {
            const np = secondary_guardian_phone
              ? normalizePhone(secondary_guardian_phone)
              : null;
            updates.phone = np;
            updates.search_phones = np ? [np.replace(/\D/g, "")] : [];
          }
          await personRef.update(updates);
        } else if (wantsSecondary && !secondaryGuardianId) {
          // No existing secondary — create one + link from the household.
          const newSecondaryRef = churchRef.collection("people").doc();
          const cleaned = secondary_guardian_name!.trim();
          const parts = cleaned.split(" ");
          const np = secondary_guardian_phone
            ? normalizePhone(secondary_guardian_phone)
            : null;
          await newSecondaryRef.set({
            church_id,
            person_type: "adult",
            first_name: parts[0] || "",
            last_name: parts.slice(1).join(" ") || "",
            preferred_name: null,
            name: cleaned,
            search_name: cleaned.toLowerCase(),
            email: null,
            phone: np,
            search_phones: np ? [np.replace(/\D/g, "")] : [],
            photo_url: null,
            user_id: null,
            membership_id: null,
            status: "active",
            is_volunteer: false,
            ministry_ids: [],
            role_ids: [],
            campus_ids: [],
            household_ids: [householdId],
            scheduling_profile: null,
            child_profile: null,
            stats: null,
            imported_from: "manual",
            background_check: null,
            role_constraints: null,
            volunteer_journey: null,
            qr_token: null,
            created_at: now,
            updated_at: now,
          });
          await hhDoc.ref.update({
            secondary_guardian_id: newSecondaryRef.id,
            updated_at: now,
          });
        } else if (!wantsSecondary && secondaryGuardianId) {
          // Caller cleared the secondary name — drop from household
          // membership AND clear the pointer (same pattern admin uses).
          const personRef = churchRef.collection("people").doc(secondaryGuardianId);
          const personSnap = await personRef.get();
          if (personSnap.exists) {
            const personData = personSnap.data() ?? {};
            const newIds = (personData.household_ids as string[] | undefined)?.filter(
              (h) => h !== householdId,
            ) ?? [];
            if (newIds.length === 0) {
              await personRef.delete();
            } else {
              await personRef.update({
                household_ids: newIds,
                updated_at: now,
              });
            }
          }
          await hhDoc.ref.update({
            secondary_guardian_id: null,
            updated_at: now,
          });
        }
      }

      await hhDoc.ref.update({ updated_at: now });
      return NextResponse.json({ updated: true });
    }

    // Legacy path — write denormalized fields on checkin_households.
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

    const householdDoc = legacySnap.docs[0];

    // Only allow updating guardian names and phones
    const updates: Record<string, unknown> = {
      updated_at: now,
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
