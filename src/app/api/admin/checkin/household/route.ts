import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import type { CheckInHousehold } from "@/lib/types";

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

      // Find primary adult per household for guardian name
      const adultsSnap = await churchRef
        .collection("people")
        .where("person_type", "==", "adult")
        .where("status", "==", "active")
        .get();

      const adultsByHousehold = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const doc of adultsSnap.docs) {
        const hhIds = doc.data().household_ids as string[] | undefined;
        if (hhIds) {
          for (const hid of hhIds) {
            if (!adultsByHousehold.has(hid)) adultsByHousehold.set(hid, doc);
          }
        }
      }

      const households = hhSnap.docs.map((doc) => {
        const data = doc.data();
        const adult = adultsByHousehold.get(doc.id)?.data();
        return {
          id: doc.id,
          primary_guardian_name: adult?.name || data.name || "Unknown",
          primary_guardian_phone: adult?.phone || null,
          secondary_guardian_name: null,
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
      // Create unified household + adult Person docs
      const householdId = adminDb.collection("_").doc().id;
      const qrToken = randomBytes(16).toString("hex");

      const hhData: Record<string, unknown> = {
        id: householdId,
        church_id,
        name: primary_guardian_name,
        qr_token: qrToken,
        created_at: now,
        updated_at: now,
      };
      await churchRef.collection("households").doc(householdId).set(hhData);

      // Create primary guardian as Person
      const phoneDigits = normalizedPhone.replace(/\D/g, "");
      const nameParts = primary_guardian_name.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const primaryPerson: Record<string, unknown> = {
        church_id,
        person_type: "adult",
        first_name: firstName,
        last_name: lastName,
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
      await churchRef.collection("people").add(primaryPerson);

      // Create secondary guardian if provided
      if (secondary_guardian_name) {
        const secNameParts = secondary_guardian_name.split(" ");
        const secPerson: Record<string, unknown> = {
          church_id,
          person_type: "adult",
          first_name: secNameParts[0] || "",
          last_name: secNameParts.slice(1).join(" ") || "",
          preferred_name: null,
          name: secondary_guardian_name,
          search_name: secondary_guardian_name.toLowerCase(),
          email: null,
          phone: secondary_guardian_phone ? normalizePhone(secondary_guardian_phone) : null,
          search_phones: secondary_guardian_phone
            ? [normalizePhone(secondary_guardian_phone)?.replace(/\D/g, "") || ""]
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
        await churchRef.collection("people").add(secPerson);
      }

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
