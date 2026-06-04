import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import type { CheckInHousehold } from "@/lib/types";
import { extractSurname, parseName } from "@/lib/utils/name";

/**
 * GET /api/admin/checkin/household?church_id=...
 * List all households for a church. Includes children_count.
 *
 * Reads from unified `households` + `people` when available,
 * falling back to legacy `checkin_households` + `children`.
 */
export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const membershipSnap = await adminDb
      .doc(`memberships/${decoded.uid}_${churchId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    const isCheckinVolunteer = membershipSnap.data()!.checkin_volunteer === true;
    if (!["owner", "admin", "scheduler"].includes(role) && !isCheckinVolunteer) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Detect whether unified `people` collection is populated
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnified = !peopleSample.empty;

    if (useUnified) {
      // Read from unified households + people collections
      const [hhSnap, childrenSnap] = await Promise.all([
        churchRef.collection("households").orderBy("name").get(),
        churchRef
          .collection("people")
          .where("person_type", "==", "child")
          .where("status", "==", "active")
          .get(),
      ]);

      // Count children per household via household_ids array
      const countMap = new Map<string, number>();
      for (const doc of childrenSnap.docs) {
        const hhIds = doc.data().household_ids as string[] | undefined;
        if (hhIds) {
          for (const hid of hhIds) {
            countMap.set(hid, (countMap.get(hid) || 0) + 1);
          }
        }
      }

      // Index adults: byId for O(1) pointer lookup, byHousehold (two
      // deep) so we can surface a secondary guardian's name when no
      // pointer is set.
      const adultsSnap = await churchRef
        .collection("people")
        .where("person_type", "==", "adult")
        .where("status", "==", "active")
        .get();

      const adultsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      const adultsByHousehold = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
      for (const doc of adultsSnap.docs) {
        adultsById.set(doc.id, doc);
        const hhIds = doc.data().household_ids as string[] | undefined;
        if (hhIds) {
          for (const hid of hhIds) {
            const existing = adultsByHousehold.get(hid) ?? [];
            if (existing.length < 2) existing.push(doc);
            adultsByHousehold.set(hid, existing);
          }
        }
      }

      const households = hhSnap.docs.map((doc) => {
        const data = doc.data();
        const primaryId = (data.primary_guardian_id as string | undefined) ?? null;
        const secondaryId = (data.secondary_guardian_id as string | undefined) ?? null;
        const householdAdults = adultsByHousehold.get(doc.id) ?? [];
        const primaryDoc =
          (primaryId ? adultsById.get(primaryId) : undefined) ??
          householdAdults[0];
        const secondaryDoc =
          (secondaryId ? adultsById.get(secondaryId) : undefined) ??
          householdAdults.find((a) => a.id !== primaryDoc?.id);
        const primary = primaryDoc?.data();
        const secondary = secondaryDoc?.data();
        return {
          id: doc.id,
          primary_guardian_name: primary?.name || data.name || "Unknown",
          primary_guardian_phone: primary?.phone || null,
          secondary_guardian_name: secondary?.name || null,
          qr_token: data.qr_token || null,
          children_count: countMap.get(doc.id) || 0,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      });

      return NextResponse.json({ households });
    }

    // Legacy: read from checkin_households + children
    const householdsSnap = await churchRef
      .collection("checkin_households")
      .orderBy("primary_guardian_name")
      .get();

    const childrenSnap = await churchRef
      .collection("children")
      .where("is_active", "==", true)
      .select("household_id")
      .get();

    const countMap = new Map<string, number>();
    for (const doc of childrenSnap.docs) {
      const hid = doc.data().household_id;
      countMap.set(hid, (countMap.get(hid) || 0) + 1);
    }

    const households = householdsSnap.docs.map((doc) => ({
      ...doc.data(),
      children_count: countMap.get(doc.id) || 0,
    }));

    return NextResponse.json({ households });
  } catch (error) {
    console.error("[GET /api/admin/checkin/household]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/checkin/household
 * Create a new check-in household. Requires owner/admin/scheduler role.
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

    // Verify membership
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const {
      primary_guardian_name,
      primary_guardian_phone,
      secondary_guardian_name,
      secondary_guardian_phone,
    } = body;

    if (!primary_guardian_name || !primary_guardian_phone) {
      return NextResponse.json(
        { error: "Missing required fields: primary_guardian_name, primary_guardian_phone" },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(primary_guardian_phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const churchRef = adminDb.collection("churches").doc(church_id);

    // Detect whether unified `people` collection is populated
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnified = !peopleSample.empty;

    if (useUnified) {
      // Create unified household + adult Person docs.
      //
      // 2026-06-03 fix: previously this wrote `name: primary_guardian_name`
      // (e.g. "Helen Pevensie") and never linked `primary_guardian_id`
      // back to the household doc. That broke wallet pass FAMILY display,
      // admin room drill-down, and guardian-portal lookups - all needed
      // surname-extraction / first-adult-wins fallbacks. Now we store the
      // surname directly + carry an explicit primary_guardian_id pointer,
      // so the downstream fallbacks only fire for legacy data.
      const householdId = adminDb.collection("_").doc().id;
      const qrToken = randomBytes(16).toString("hex");

      // Allocate the primary Person ref up front so we can stamp
      // primary_guardian_id on the household doc in the same batch.
      const primaryPersonRef = churchRef.collection("people").doc();
      const phoneDigits = normalizedPhone.replace(/\D/g, "");
      const primaryParsed = parseName(primary_guardian_name);

      const primaryPerson: Record<string, unknown> = {
        church_id,
        person_type: "adult",
        first_name: primaryParsed.first_name,
        last_name: primaryParsed.last_name,
        preferred_name: null,
        name: primary_guardian_name,
        search_name: primary_guardian_name.toLowerCase(),
        email: null,
        phone: normalizedPhone,
        search_phones: [phoneDigits],
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
      };

      // Optional secondary guardian.
      let secondaryPersonRef: FirebaseFirestore.DocumentReference | null = null;
      let secondaryPerson: Record<string, unknown> | null = null;
      if (secondary_guardian_name) {
        secondaryPersonRef = churchRef.collection("people").doc();
        const secondaryParsed = parseName(secondary_guardian_name);
        const normalizedSecondaryPhone = secondary_guardian_phone
          ? normalizePhone(secondary_guardian_phone)
          : null;
        secondaryPerson = {
          church_id,
          person_type: "adult",
          first_name: secondaryParsed.first_name,
          last_name: secondaryParsed.last_name,
          preferred_name: null,
          name: secondary_guardian_name,
          search_name: secondary_guardian_name.toLowerCase(),
          email: null,
          phone: normalizedSecondaryPhone,
          search_phones: normalizedSecondaryPhone
            ? [normalizedSecondaryPhone.replace(/\D/g, "")]
            : [],
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
        };
      }

      // Household doc: surname-only name + explicit guardian pointers.
      // Falls back to the full guardian name if the surname can't be
      // extracted (single-token input with no whitespace).
      const surname =
        extractSurname(primaryParsed.last_name) ||
        extractSurname(primary_guardian_name) ||
        primary_guardian_name;
      const hhData: Record<string, unknown> = {
        id: householdId,
        church_id,
        name: surname,
        primary_guardian_id: primaryPersonRef.id,
        secondary_guardian_id: secondaryPersonRef?.id ?? null,
        qr_token: qrToken,
        created_at: now,
        updated_at: now,
      };

      // Single batched write so a failure in any leg leaves no orphans.
      const batch = adminDb.batch();
      batch.set(churchRef.collection("households").doc(householdId), hhData);
      batch.set(primaryPersonRef, primaryPerson);
      if (secondaryPersonRef && secondaryPerson) {
        batch.set(secondaryPersonRef, secondaryPerson);
      }
      await batch.commit();

      // Return in legacy-compatible shape for the admin UI
      const result: Record<string, unknown> = {
        id: householdId,
        church_id,
        primary_guardian_name,
        primary_guardian_phone: normalizedPhone,
        qr_token: qrToken,
        imported_from: "manual",
        created_at: now,
        updated_at: now,
        created_by: userId,
      };
      if (secondary_guardian_name) result.secondary_guardian_name = secondary_guardian_name;
      if (secondary_guardian_phone) {
        const ns = normalizePhone(secondary_guardian_phone);
        if (ns) result.secondary_guardian_phone = ns;
      }
      return NextResponse.json(result, { status: 201 });
    }

    // Legacy: write to checkin_households
    const householdId = adminDb.collection("_").doc().id;

    const household: Record<string, unknown> = {
      id: householdId,
      church_id,
      primary_guardian_name,
      primary_guardian_phone: normalizedPhone,
      qr_token: randomBytes(16).toString("hex"),
      imported_from: "manual",
      created_at: now,
      updated_at: now,
      created_by: userId,
    };

    // Only include optional fields if present (Firestore rejects undefined)
    if (secondary_guardian_name) {
      household.secondary_guardian_name = secondary_guardian_name;
    }
    if (secondary_guardian_phone) {
      const normalizedSecondary = normalizePhone(secondary_guardian_phone);
      if (normalizedSecondary) {
        household.secondary_guardian_phone = normalizedSecondary;
      }
    }

    await churchRef
      .collection("checkin_households")
      .doc(householdId)
      .set(household);

    return NextResponse.json(household, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/checkin/household]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
