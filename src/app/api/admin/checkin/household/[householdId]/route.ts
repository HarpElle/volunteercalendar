import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/admin/checkin/household/[householdId]
 * Retrieve a single check-in household with its children.
 *
 * PUT /api/admin/checkin/household/[householdId]
 * Update household guardian info.
 *
 * DELETE /api/admin/checkin/household/[householdId]
 * Delete the household and all linked children/people.
 *
 * Reads and writes the unified `households` + `people` collections when
 * available (detected by sampling the church's `people` collection), falling
 * back to legacy `checkin_households` + `children` for older orgs.
 *
 * The Pro tier check-in flow writes new households to the unified collection
 * (see `src/app/api/admin/checkin/household/route.ts:189-206`). Before this
 * change, the detail endpoint only read from `checkin_households`, so the
 * detail page reported "Household not found" immediately after a successful
 * create.
 */

async function verifyAdmin(
  req: NextRequest,
  churchId: string,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  const userId = decoded.uid;

  const membershipSnap = await adminDb
    .doc(`memberships/${userId}_${churchId}`)
    .get();
  if (!membershipSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const membership = membershipSnap.data()!;
  const role = membership.role as string;
  const isCheckinVolunteer = membership.checkin_volunteer === true;
  if (!["owner", "admin", "scheduler"].includes(role) && !isCheckinVolunteer) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }
  return { userId };
}

async function detectUnified(
  churchRef: FirebaseFirestore.DocumentReference,
): Promise<boolean> {
  const peopleSample = await churchRef.collection("people").limit(1).get();
  return !peopleSample.empty;
}

/**
 * Map a unified household + its linked adult/child Person docs into the legacy
 * `{ household, children }` shape the admin UI expects.
 */
async function loadUnifiedHousehold(
  churchRef: FirebaseFirestore.DocumentReference,
  householdId: string,
): Promise<{ household: Record<string, unknown>; children: Record<string, unknown>[] } | null> {
  const hhDoc = await churchRef.collection("households").doc(householdId).get();
  if (!hhDoc.exists) return null;
  const hhData = hhDoc.data() || {};

  // All people in this household — split into adults vs children
  const peopleSnap = await churchRef
    .collection("people")
    .where("household_ids", "array-contains", householdId)
    .get();

  const adults: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
  const childPeople: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
  for (const d of peopleSnap.docs) {
    const data = d.data();
    if (data.person_type === "adult") adults.push({ id: d.id, data });
    else if (data.person_type === "child") childPeople.push({ id: d.id, data });
  }

  const primary = adults[0]?.data;
  const secondary = adults[1]?.data;

  const household: Record<string, unknown> = {
    id: householdId,
    church_id: hhData.church_id,
    primary_guardian_name: primary?.name || hhData.name || "Unknown",
    primary_guardian_phone: primary?.phone || null,
    secondary_guardian_name: secondary?.name || null,
    secondary_guardian_phone: secondary?.phone || null,
    qr_token: hhData.qr_token || null,
    imported_from: hhData.imported_from || "manual",
    created_at: hhData.created_at,
    updated_at: hhData.updated_at,
  };

  const children = childPeople
    .filter((c) => c.data.status === "active")
    .map((c) => {
      const cp = c.data.child_profile || {};
      return {
        id: c.id,
        church_id: c.data.church_id,
        household_id: householdId,
        first_name: c.data.first_name,
        last_name: c.data.last_name,
        preferred_name: c.data.preferred_name || null,
        date_of_birth: cp.date_of_birth || null,
        grade: cp.grade || null,
        photo_url: c.data.photo_url || cp.photo_url || null,
        default_room_id: cp.default_room_id || null,
        has_alerts: cp.has_alerts || false,
        allergies: cp.allergies || null,
        medical_notes: cp.medical_notes || null,
        // Wave 9 P0-2: include authorized-pickup contacts so the
        // household admin UI can render the per-child panel without
        // a second Firestore round-trip.
        authorized_pickups: Array.isArray(cp.authorized_pickups)
          ? cp.authorized_pickups
          : [],
        is_active: c.data.status === "active",
        created_at: c.data.created_at,
        updated_at: c.data.updated_at,
      };
    });

  return { household, children };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const { householdId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(churchId);
    const useUnified = await detectUnified(churchRef);

    if (useUnified) {
      const unified = await loadUnifiedHousehold(churchRef, householdId);
      if (!unified) {
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(unified);
    }

    // Legacy: read from checkin_households + children
    const householdSnap = await churchRef
      .collection("checkin_households")
      .doc(householdId)
      .get();
    if (!householdSnap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    const childrenSnap = await churchRef
      .collection("children")
      .where("household_id", "==", householdId)
      .get();

    const children = childrenSnap.docs.map((doc) => doc.data());

    return NextResponse.json({
      household: householdSnap.data(),
      children,
    });
  } catch (error) {
    console.error("[GET /api/admin/checkin/household/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const { householdId } = await params;
    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, church_id);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(church_id);
    const useUnified = await detectUnified(churchRef);

    if (useUnified) {
      // In unified mode, guardian info lives on the linked adult Person docs.
      const hhDoc = await churchRef
        .collection("households")
        .doc(householdId)
        .get();
      if (!hhDoc.exists) {
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
      }

      const adultsSnap = await churchRef
        .collection("people")
        .where("household_ids", "array-contains", householdId)
        .where("person_type", "==", "adult")
        .get();
      const adults = adultsSnap.docs;
      const now = new Date().toISOString();

      // Update primary adult (first adult in the household)
      if ("primary_guardian_name" in body || "primary_guardian_phone" in body) {
        if (adults.length === 0) {
          return NextResponse.json(
            { error: "No primary guardian found for this household" },
            { status: 400 },
          );
        }
        const primaryRef = adults[0].ref;
        const updates: Record<string, unknown> = { updated_at: now };
        if (body.primary_guardian_name) {
          updates.name = body.primary_guardian_name;
          updates.search_name = String(body.primary_guardian_name).toLowerCase();
          const parts = String(body.primary_guardian_name).split(" ");
          updates.first_name = parts[0] || "";
          updates.last_name = parts.slice(1).join(" ") || "";
        }
        if (body.primary_guardian_phone) {
          const normalized = normalizePhone(body.primary_guardian_phone);
          if (!normalized) {
            return NextResponse.json(
              { error: "Invalid phone format for primary_guardian_phone" },
              { status: 400 },
            );
          }
          updates.phone = normalized;
          updates.search_phones = [normalized.replace(/\D/g, "")];
        }
        await primaryRef.update(updates);
      }

      // Update or remove secondary adult
      if (
        "secondary_guardian_name" in body ||
        "secondary_guardian_phone" in body
      ) {
        const secondaryRef = adults[1]?.ref;
        const wantsSecondary = !!body.secondary_guardian_name;
        if (wantsSecondary && secondaryRef) {
          const updates: Record<string, unknown> = { updated_at: now };
          if (body.secondary_guardian_name) {
            updates.name = body.secondary_guardian_name;
            updates.search_name = String(
              body.secondary_guardian_name,
            ).toLowerCase();
            const parts = String(body.secondary_guardian_name).split(" ");
            updates.first_name = parts[0] || "";
            updates.last_name = parts.slice(1).join(" ") || "";
          }
          if (body.secondary_guardian_phone) {
            const normalized = normalizePhone(body.secondary_guardian_phone);
            if (normalized) {
              updates.phone = normalized;
              updates.search_phones = [normalized.replace(/\D/g, "")];
            }
          } else if (body.secondary_guardian_phone === null) {
            updates.phone = null;
            updates.search_phones = [];
          }
          await secondaryRef.update(updates);
        } else if (wantsSecondary && !secondaryRef) {
          // Create a new secondary adult person linked to this household
          const parts = String(body.secondary_guardian_name).split(" ");
          const normalized = body.secondary_guardian_phone
            ? normalizePhone(body.secondary_guardian_phone)
            : null;
          await churchRef.collection("people").add({
            church_id,
            person_type: "adult",
            first_name: parts[0] || "",
            last_name: parts.slice(1).join(" ") || "",
            preferred_name: null,
            name: body.secondary_guardian_name,
            search_name: String(body.secondary_guardian_name).toLowerCase(),
            email: null,
            phone: normalized,
            search_phones: normalized ? [normalized.replace(/\D/g, "")] : [],
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
        } else if (!wantsSecondary && secondaryRef) {
          // Removing the secondary guardian: drop them from this household.
          const currentData = adults[1].data();
          const newIds = (currentData.household_ids as string[] | undefined)?.filter(
            (h) => h !== householdId,
          ) || [];
          if (newIds.length === 0) {
            await secondaryRef.delete();
          } else {
            await secondaryRef.update({
              household_ids: newIds,
              updated_at: now,
            });
          }
        }
      }

      // Update the household doc's updated_at
      await hhDoc.ref.update({ updated_at: now });

      const refreshed = await loadUnifiedHousehold(churchRef, householdId);
      return NextResponse.json(refreshed?.household || {});
    }

    // Legacy: write to checkin_households
    const householdRef = churchRef
      .collection("checkin_households")
      .doc(householdId);

    const householdSnap = await householdRef.get();
    if (!householdSnap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    const allowedFields = [
      "primary_guardian_name",
      "primary_guardian_phone",
      "secondary_guardian_name",
      "secondary_guardian_phone",
      "photo_url",
    ];

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in body) {
        if (field.includes("phone") && body[field]) {
          const normalized = normalizePhone(body[field]);
          if (!normalized) {
            return NextResponse.json(
              { error: `Invalid phone format for ${field}` },
              { status: 400 },
            );
          }
          updates[field] = normalized;
        } else {
          updates[field] = body[field];
        }
      }
    }

    await householdRef.update(updates);

    const updated = await householdRef.get();
    return NextResponse.json(updated.data());
  } catch (error) {
    console.error("[PUT /api/admin/checkin/household/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const { householdId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(churchId);
    const useUnified = await detectUnified(churchRef);

    if (useUnified) {
      const hhRef = churchRef.collection("households").doc(householdId);
      const hhSnap = await hhRef.get();
      if (!hhSnap.exists) {
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
      }

      // Detach all people from this household. If a person has no other
      // households after removal, delete them (orphaned people don't belong
      // anywhere). Otherwise just trim their household_ids.
      const peopleSnap = await churchRef
        .collection("people")
        .where("household_ids", "array-contains", householdId)
        .get();

      const batch = adminDb.batch();
      const now = new Date().toISOString();
      for (const doc of peopleSnap.docs) {
        const hhIds = (doc.data().household_ids as string[] | undefined) || [];
        const remaining = hhIds.filter((h) => h !== householdId);
        if (remaining.length === 0) {
          batch.delete(doc.ref);
        } else {
          batch.update(doc.ref, {
            household_ids: remaining,
            updated_at: now,
          });
        }
      }
      batch.delete(hhRef);
      await batch.commit();

      return NextResponse.json({ success: true });
    }

    // Legacy: delete from checkin_households + children
    const householdRef = churchRef
      .collection("checkin_households")
      .doc(householdId);

    const householdSnap = await householdRef.get();
    if (!householdSnap.exists) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }

    const childrenSnap = await churchRef
      .collection("children")
      .where("household_id", "==", householdId)
      .get();

    const batch = adminDb.batch();
    for (const doc of childrenSnap.docs) {
      batch.delete(doc.ref);
    }
    batch.delete(householdRef);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/checkin/household/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
