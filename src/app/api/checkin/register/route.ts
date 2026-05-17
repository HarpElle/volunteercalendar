import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { audit, kioskActor } from "@/lib/server/audit";
import { randomBytes } from "crypto";
import type { CheckInHousehold, ChildGrade } from "@/lib/types";

/**
 * POST /api/checkin/register
 * Kiosk endpoint — first-time visitor registration.
 *
 * Writes to the unified `households` + `people` collections when present
 * (matching the admin household create endpoint), or to legacy
 * `checkin_households` + `children` for older orgs.
 *
 * Before the unified-mode branch existed, this endpoint always wrote to the
 * legacy collections. Pro-tier orgs use unified mode for the kiosk lookup
 * path (`/api/checkin/lookup`), so freshly-registered visitors became
 * unreachable: the registration appeared to succeed (in the legacy collection)
 * but lookup queried the unified collection and found nothing. Codex's QA
 * also hit the 500 path because `secondary_guardian_name: secondary || undefined`
 * on the legacy `set()` produced a Firestore "unsupported field value: undefined"
 * error when `secondary_guardian_name` was absent — fixed below by building the
 * payload conditionally.
 *
 * Requires X-Kiosk-Token header (see src/lib/server/authz.ts).
 * Tighter rate limit (10 req/min) to prevent abuse.
 */
export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "register");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const {
      church_id,
      primary_guardian_name,
      primary_guardian_phone,
      secondary_guardian_name,
      secondary_guardian_phone,
      children,
    } = body as {
      church_id: string;
      primary_guardian_name: string;
      primary_guardian_phone: string;
      secondary_guardian_name?: string;
      secondary_guardian_phone?: string;
      children: {
        first_name: string;
        last_name: string;
        date_of_birth?: string;
        grade?: string;
        allergies?: string;
        medical_notes?: string;
      }[];
    };

    if (
      !church_id ||
      !primary_guardian_name ||
      !primary_guardian_phone ||
      !children?.length
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, church_id);
    if (churchMismatch) return churchMismatch;

    // Validate church exists
    const churchRef = adminDb.collection("churches").doc(church_id);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }

    // Normalize phone to E.164
    const normalizedPhone = normalizePhone(primary_guardian_phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    // Detect unified vs legacy collection layout
    const peopleSample = await churchRef.collection("people").limit(1).get();
    const useUnified = !peopleSample.empty;

    if (useUnified) {
      return registerUnified(churchRef, {
        kiosk,
        church_id,
        primary_guardian_name,
        primary_guardian_phone: normalizedPhone,
        secondary_guardian_name,
        secondary_guardian_phone,
        children,
      });
    }
    return registerLegacy(churchRef, {
      kiosk,
      church_id,
      primary_guardian_name,
      primary_guardian_phone: normalizedPhone,
      secondary_guardian_name,
      secondary_guardian_phone,
      children,
    });
  } catch (error) {
    console.error("[POST /api/checkin/register]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

interface RegisterArgs {
  kiosk: { station_id?: string | null };
  church_id: string;
  primary_guardian_name: string;
  primary_guardian_phone: string;
  secondary_guardian_name?: string;
  secondary_guardian_phone?: string;
  children: {
    first_name: string;
    last_name: string;
    date_of_birth?: string;
    grade?: string;
    allergies?: string;
    medical_notes?: string;
  }[];
}

async function registerUnified(
  churchRef: FirebaseFirestore.DocumentReference,
  args: RegisterArgs,
) {
  const {
    kiosk,
    church_id,
    primary_guardian_name,
    primary_guardian_phone,
    secondary_guardian_name,
    secondary_guardian_phone,
    children,
  } = args;

  // Duplicate detection: check if an adult with this phone already exists.
  const phoneDigits = primary_guardian_phone.replace(/\D/g, "");
  const dupAdultSnap = await churchRef
    .collection("people")
    .where("search_phones", "array-contains", phoneDigits)
    .limit(1)
    .get();
  if (!dupAdultSnap.empty) {
    const existingAdult = dupAdultSnap.docs[0];
    const hhIds = (existingAdult.data().household_ids as string[]) || [];
    const existingHhId = hhIds[0];
    if (existingHhId) {
      const hhDoc = await churchRef
        .collection("households")
        .doc(existingHhId)
        .get();
      const qrToken = hhDoc.exists ? hhDoc.data()!.qr_token : null;
      void audit({
        church_id,
        actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
        action: "kiosk.register_visitor",
        target_type: "checkin_household",
        target_id: existingHhId,
        metadata: { outcome_detail: "duplicate_phone_match" },
        outcome: "ok",
      });
      return NextResponse.json({
        household_id: existingHhId,
        qr_token: qrToken,
        children: [],
        duplicate: true,
      });
    }
  }

  const now = new Date().toISOString();
  const householdId = adminDb.collection("_").doc().id;
  const qrToken = randomBytes(16).toString("hex");

  // Create household
  await churchRef.collection("households").doc(householdId).set({
    id: householdId,
    church_id,
    name: primary_guardian_name,
    qr_token: qrToken,
    imported_from: "kiosk",
    created_at: now,
    updated_at: now,
  });

  // Create primary adult Person
  await churchRef.collection("people").add(buildAdultPerson({
    church_id,
    name: primary_guardian_name,
    phone: primary_guardian_phone,
    householdId,
    now,
  }));

  // Optional secondary adult
  if (secondary_guardian_name) {
    const normalizedSecondary = secondary_guardian_phone
      ? normalizePhone(secondary_guardian_phone)
      : null;
    await churchRef.collection("people").add(buildAdultPerson({
      church_id,
      name: secondary_guardian_name,
      phone: normalizedSecondary,
      householdId,
      now,
    }));
  }

  // Create children as Person docs of type "child"
  const createdChildren: { id: string; first_name: string; last_name: string }[] = [];
  for (const childData of children) {
    if (!childData.first_name || !childData.last_name) continue;
    const hasAlerts = !!(childData.allergies || childData.medical_notes);
    const newRef = await churchRef.collection("people").add({
      church_id,
      person_type: "child",
      first_name: childData.first_name,
      last_name: childData.last_name,
      preferred_name: null,
      name: `${childData.first_name} ${childData.last_name}`,
      search_name: `${childData.first_name} ${childData.last_name}`.toLowerCase(),
      email: null,
      phone: null,
      search_phones: [],
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
      child_profile: {
        date_of_birth: childData.date_of_birth || null,
        grade: normalizeGrade(childData.grade) || null,
        photo_url: null,
        default_room_id: null,
        has_alerts: hasAlerts,
        allergies: childData.allergies || null,
        medical_notes: childData.medical_notes || null,
        authorized_pickups: [],
      },
      stats: null,
      imported_from: "kiosk",
      background_check: null,
      role_constraints: null,
      volunteer_journey: null,
      qr_token: null,
      created_at: now,
      updated_at: now,
    });
    createdChildren.push({
      id: newRef.id,
      first_name: childData.first_name,
      last_name: childData.last_name,
    });
  }

  void audit({
    church_id,
    actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
    action: "kiosk.register_visitor",
    target_type: "checkin_household",
    target_id: householdId,
    metadata: {
      children_count: createdChildren.length,
      any_alerts: createdChildren.length > 0
        ? children.some((c) => c.allergies || c.medical_notes)
        : false,
    },
    outcome: "ok",
  });

  return NextResponse.json({
    household_id: householdId,
    qr_token: qrToken,
    children: createdChildren,
  });
}

async function registerLegacy(
  churchRef: FirebaseFirestore.DocumentReference,
  args: RegisterArgs,
) {
  const {
    kiosk,
    church_id,
    primary_guardian_name,
    primary_guardian_phone,
    secondary_guardian_name,
    secondary_guardian_phone,
    children,
  } = args;

  // Track B.5 (lite): duplicate detection. If a household with this exact
  // primary phone already exists, return that household instead of creating
  // a new one. Prevents accidental DB pollution from operators retrying.
  const dupSnap = await churchRef
    .collection("checkin_households")
    .where("primary_guardian_phone", "==", primary_guardian_phone)
    .limit(1)
    .get();
  if (!dupSnap.empty) {
    const existing = dupSnap.docs[0].data() as CheckInHousehold;
    void audit({
      church_id,
      actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
      action: "kiosk.register_visitor",
      target_type: "checkin_household",
      target_id: existing.id,
      metadata: { outcome_detail: "duplicate_phone_match" },
      outcome: "ok",
    });
    return NextResponse.json({
      household_id: existing.id,
      qr_token: existing.qr_token,
      children: [],
      duplicate: true,
    });
  }

  const now = new Date().toISOString();
  const qrToken = randomBytes(16).toString("hex");

  // Create household — build conditionally to avoid `undefined` field values,
  // which Firestore rejects. Earlier code spread secondary_guardian_name even
  // when it was undefined, which threw and surfaced as a 500.
  const householdId = adminDb.collection("_").doc().id;
  const household: Record<string, unknown> = {
    id: householdId,
    church_id,
    primary_guardian_name,
    primary_guardian_phone,
    qr_token: qrToken,
    imported_from: "manual",
    created_at: now,
    updated_at: now,
  };
  if (secondary_guardian_name) {
    household.secondary_guardian_name = secondary_guardian_name;
  }
  if (secondary_guardian_phone) {
    const ns = normalizePhone(secondary_guardian_phone);
    if (ns) household.secondary_guardian_phone = ns;
  }

  await churchRef
    .collection("checkin_households")
    .doc(householdId)
    .set(household);

  // Create child documents
  const createdChildren: { id: string; first_name: string; last_name: string }[] = [];

  for (const childData of children) {
    if (!childData.first_name || !childData.last_name) continue;

    const childId = adminDb.collection("_").doc().id;
    const hasAlerts = !!(childData.allergies || childData.medical_notes);
    const grade = normalizeGrade(childData.grade);

    const child: Record<string, unknown> = {
      id: childId,
      church_id,
      household_id: householdId,
      first_name: childData.first_name,
      last_name: childData.last_name,
      has_alerts: hasAlerts,
      imported_from: "manual",
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    if (childData.date_of_birth) child.date_of_birth = childData.date_of_birth;
    if (grade) child.grade = grade;
    if (childData.allergies) child.allergies = childData.allergies;
    if (childData.medical_notes) child.medical_notes = childData.medical_notes;

    await churchRef.collection("children").doc(childId).set(child);
    createdChildren.push({
      id: childId,
      first_name: childData.first_name,
      last_name: childData.last_name,
    });
  }

  void audit({
    church_id,
    actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
    action: "kiosk.register_visitor",
    target_type: "checkin_household",
    target_id: householdId,
    metadata: {
      children_count: createdChildren.length,
      any_alerts: createdChildren.length > 0
        ? children.some((c) => c.allergies || c.medical_notes)
        : false,
    },
    outcome: "ok",
  });

  return NextResponse.json({
    household_id: householdId,
    qr_token: qrToken,
    children: createdChildren,
  });
}

function buildAdultPerson(args: {
  church_id: string;
  name: string;
  phone: string | null;
  householdId: string;
  now: string;
}): Record<string, unknown> {
  const { church_id, name, phone, householdId, now } = args;
  const nameParts = name.split(" ");
  const digits = phone ? phone.replace(/\D/g, "") : null;
  return {
    church_id,
    person_type: "adult",
    first_name: nameParts[0] || "",
    last_name: nameParts.slice(1).join(" ") || "",
    preferred_name: null,
    name,
    search_name: name.toLowerCase(),
    email: null,
    phone: phone || null,
    search_phones: digits ? [digits] : [],
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
    imported_from: "kiosk",
    background_check: null,
    role_constraints: null,
    volunteer_journey: null,
    qr_token: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Normalize a phone number to E.164 format.
 * Handles common US formats: (512) 555-1234, 512-555-1234, 5125551234, +15125551234
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * The kiosk's visitor-registration UI emits grade values with underscores
 * (`pre_k`) while the Child / Person.child_profile schema uses hyphens
 * (`pre-k`). Normalize before persisting so the value round-trips through the
 * grade picker.
 */
function normalizeGrade(raw: string | undefined): ChildGrade | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().replace(/_/g, "-");
  const valid: ChildGrade[] = [
    "nursery",
    "toddler",
    "pre-k",
    "kindergarten",
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
  ];
  return valid.includes(v as ChildGrade) ? (v as ChildGrade) : undefined;
}
