import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import {
  getChildPrivateMedical,
  writeChildPrivateMedical,
  type ChildPrivateMedical,
} from "@/lib/server/child-medical";

/**
 * GET /api/admin/checkin/children/[childId]?church_id=...
 * Retrieve a single child record.
 *
 * PUT /api/admin/checkin/children/[childId]
 * Update a child record. Handles both unified (Person doc with
 * person_type="child") and legacy (children collection) shapes.
 *
 * DELETE /api/admin/checkin/children/[childId]?church_id=...&household_id=...
 * Remove a child from a household. Soft-delete with the same
 * cross-household semantics as /api/guardian/children — drops the
 * household_id from the array, marks status="inactive" only when no
 * households remain. Unified shape only (legacy children collection
 * isn't used for the household-scoped UI that calls this).
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
  const role = membershipSnap.data()!.role as string;
  if (!["owner", "admin", "scheduler"].includes(role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }
  return { userId };
}

const VALID_GRADES = new Set([
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
  "7th",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Try unified first.
    const personSnap = await churchRef
      .collection("people")
      .doc(childId)
      .get();
    if (personSnap.exists) {
      const d = personSnap.data() ?? {};
      if (d.person_type === "child") {
        const cp = (d.child_profile as Record<string, unknown>) ?? {};
        // Phase 3: allergies/medical_notes live in the private subdoc.
        const medical = await getChildPrivateMedical(churchRef, childId);
        return NextResponse.json({
          id: childId,
          first_name: d.first_name,
          last_name: d.last_name,
          preferred_name: d.preferred_name ?? null,
          grade: cp.grade ?? null,
          allergies: medical.allergies ?? null,
          medical_notes: medical.medical_notes ?? null,
          has_alerts: cp.has_alerts ?? false,
          status: d.status,
        });
      }
    }

    // Fall back to legacy children collection.
    const childSnap = await churchRef
      .collection("children")
      .doc(childId)
      .get();
    if (!childSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }
    return NextResponse.json(childSnap.data());
  } catch (error) {
    console.error("[GET /api/admin/checkin/children/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await params;
    const body = await req.json();
    const { church_id } = body;

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await verifyAdmin(req, church_id);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Try unified first.
    const personRef = churchRef.collection("people").doc(childId);
    const personSnap = await personRef.get();

    if (personSnap.exists) {
      const data = personSnap.data() ?? {};
      if (data.person_type === "child") {
        const updates: Record<string, unknown> = {};

        if (typeof body.first_name === "string") {
          const v = body.first_name.trim();
          if (!v) {
            return NextResponse.json(
              { error: "first_name cannot be blank" },
              { status: 400 },
            );
          }
          if (v.length > 100) {
            return NextResponse.json(
              { error: "first_name too long (max 100 chars)" },
              { status: 400 },
            );
          }
          updates.first_name = v;
        }
        if (typeof body.last_name === "string") {
          const v = body.last_name.trim();
          if (!v) {
            return NextResponse.json(
              { error: "last_name cannot be blank" },
              { status: 400 },
            );
          }
          if (v.length > 100) {
            return NextResponse.json(
              { error: "last_name too long (max 100 chars)" },
              { status: 400 },
            );
          }
          updates.last_name = v;
        }
        if ("preferred_name" in body) {
          const v =
            typeof body.preferred_name === "string" &&
            body.preferred_name.trim()
              ? body.preferred_name.trim()
              : null;
          if (v && v.length > 100) {
            return NextResponse.json(
              { error: "preferred_name too long (max 100 chars)" },
              { status: 400 },
            );
          }
          updates.preferred_name = v;
        }
        if ("first_name" in updates || "last_name" in updates) {
          const newFirst =
            (updates.first_name as string) ?? data.first_name ?? "";
          const newLast =
            (updates.last_name as string) ?? data.last_name ?? "";
          const fullName = `${newFirst} ${newLast}`.trim();
          updates.name = fullName;
          updates.search_name = fullName.toLowerCase();
        }

        if ("grade" in body) {
          let v: string | null = null;
          if (typeof body.grade === "string" && body.grade.trim()) {
            const g = body.grade.trim();
            if (!VALID_GRADES.has(g)) {
              return NextResponse.json(
                {
                  error: `Invalid grade. Must be one of: ${[...VALID_GRADES].join(", ")}`,
                },
                { status: 400 },
              );
            }
            v = g;
          }
          updates["child_profile.grade"] = v;
        }

        // Phase 3: allergies + medical_notes now live in the private medical
        // subdoc, NOT on the parent child_profile. Compute the new values
        // here but write them via the helper below.
        const allergiesTouched = "allergies" in body;
        const medicalNotesTouched = "medical_notes" in body;
        let newAllergies: string | null = null;
        if (allergiesTouched) {
          newAllergies =
            typeof body.allergies === "string" && body.allergies.trim()
              ? body.allergies.trim().slice(0, 2000)
              : null;
        }
        let newMedicalNotes: string | null = null;
        if (medicalNotesTouched) {
          newMedicalNotes =
            typeof body.medical_notes === "string" &&
            body.medical_notes.trim()
              ? body.medical_notes.trim().slice(0, 2000)
              : null;
        }

        // Recompute has_alerts (a SAFE field that stays on the parent) if
        // either alert-relevant field was touched. Use the current private
        // medical record for untouched values.
        let medical: ChildPrivateMedical | null = null;
        if (allergiesTouched || medicalNotesTouched) {
          medical = await getChildPrivateMedical(churchRef, childId);
          const finalAllergies = allergiesTouched
            ? newAllergies
            : medical.allergies;
          const finalMedical = medicalNotesTouched
            ? newMedicalNotes
            : medical.medical_notes;
          updates["child_profile.has_alerts"] = !!(
            finalAllergies || finalMedical
          );
        }

        const now = new Date().toISOString();
        updates.updated_at = now;
        await personRef.update(updates);

        // Persist the sensitive fields to the private subdoc, preserving the
        // private fields that weren't touched by this request.
        if (medical) {
          writeChildPrivateMedical(
            churchRef,
            childId,
            {
              date_of_birth: medical.date_of_birth,
              allergies: allergiesTouched ? newAllergies : medical.allergies,
              medical_notes: medicalNotesTouched
                ? newMedicalNotes
                : medical.medical_notes,
              medications: medical.medications,
              authorized_pickups: medical.authorized_pickups,
            },
            now,
          );
        }

        void audit({
          church_id,
          actor: userActor(userId),
          action: "checkin.child_updated",
          target_type: "person",
          target_id: childId,
          metadata: {
            via: "admin_household_page",
            fields: Object.keys(body).filter((k) => k !== "church_id"),
          },
          outcome: "ok",
        });

        const refreshed = await personRef.get();
        const r = refreshed.data() ?? {};
        const rcp = (r.child_profile as Record<string, unknown>) ?? {};
        // Phase 3: read the (just-written) sensitive fields from the private
        // subdoc.
        const refreshedMedical = await getChildPrivateMedical(
          churchRef,
          childId,
        );
        return NextResponse.json({
          id: childId,
          first_name: r.first_name,
          last_name: r.last_name,
          preferred_name: r.preferred_name ?? null,
          grade: rcp.grade ?? null,
          allergies: refreshedMedical.allergies ?? null,
          medical_notes: refreshedMedical.medical_notes ?? null,
          has_alerts: rcp.has_alerts ?? false,
        });
      }
    }

    // Legacy fallback — write to children collection.
    const childRef = churchRef.collection("children").doc(childId);
    const childSnap = await childRef.get();
    if (!childSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    const allowedFields = [
      "first_name",
      "last_name",
      "preferred_name",
      "date_of_birth",
      "grade",
      "photo_url",
      "default_room_id",
      "allergies",
      "medical_notes",
      "is_active",
    ];

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    const allergies =
      "allergies" in body ? body.allergies : childSnap.data()!.allergies;
    const medicalNotes =
      "medical_notes" in body
        ? body.medical_notes
        : childSnap.data()!.medical_notes;
    updates.has_alerts = !!(allergies || medicalNotes);

    await childRef.update(updates);

    void audit({
      church_id,
      actor: userActor(userId),
      action: "checkin.child_updated",
      target_type: "child",
      target_id: childId,
      metadata: {
        via: "admin_household_page_legacy",
      },
      outcome: "ok",
    });

    const updated = await childRef.get();
    return NextResponse.json(updated.data());
  } catch (error) {
    console.error("[PUT /api/admin/checkin/children/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const { childId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    const householdId = req.nextUrl.searchParams.get("household_id");

    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }
    if (!householdId) {
      return NextResponse.json(
        { error: "Missing household_id" },
        { status: 400 },
      );
    }

    const auth = await verifyAdmin(req, churchId);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const churchRef = adminDb.collection("churches").doc(churchId);
    const personRef = churchRef.collection("people").doc(childId);
    const personSnap = await personRef.get();

    if (!personSnap.exists) {
      // Legacy fallback — set is_active=false on the children doc
      const childRef = churchRef.collection("children").doc(childId);
      const childSnap = await childRef.get();
      if (!childSnap.exists) {
        return NextResponse.json(
          { error: "Child not found" },
          { status: 404 },
        );
      }
      const now = new Date().toISOString();
      await childRef.update({ is_active: false, updated_at: now });
      void audit({
        church_id: churchId,
        actor: userActor(userId),
        action: "checkin.child_archived",
        target_type: "child",
        target_id: childId,
        metadata: {
          via: "admin_household_page_legacy",
          household_id: householdId,
        },
        outcome: "ok",
      });
      return NextResponse.json({ id: childId, made_inactive: true });
    }

    const data = personSnap.data() ?? {};
    if (data.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (data.person_type !== "child") {
      return NextResponse.json(
        { error: "Target person is not a child" },
        { status: 400 },
      );
    }
    const childHouseholds = Array.isArray(data.household_ids)
      ? (data.household_ids as string[])
      : [];
    if (!childHouseholds.includes(householdId)) {
      return NextResponse.json(
        { error: "Child does not belong to this household" },
        { status: 403 },
      );
    }

    const remainingHouseholds = childHouseholds.filter(
      (h) => h !== householdId,
    );
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      household_ids: remainingHouseholds,
      updated_at: now,
    };
    let madeInactive = false;
    if (remainingHouseholds.length === 0) {
      updates.status = "inactive";
      madeInactive = true;
    }
    await personRef.update(updates);

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: madeInactive
        ? "checkin.child_archived"
        : "checkin.child_unlinked_from_household",
      target_type: "person",
      target_id: childId,
      metadata: {
        via: "admin_household_page",
        household_id: householdId,
        remaining_household_count: remainingHouseholds.length,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      id: childId,
      removed_from_household: householdId,
      remaining_household_count: remainingHouseholds.length,
      made_inactive: madeInactive,
    });
  } catch (error) {
    console.error("[DELETE /api/admin/checkin/children/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
