/**
 * PUT /api/guardian/children/[childId]
 * DELETE /api/guardian/children/[childId]
 *
 * Family Portal child edit + remove. Same QR-token auth pattern as the
 * rest of /api/guardian/*. The token resolves the household; the
 * requested child must belong to that household — cross-household
 * mutations are rejected with 403.
 *
 * Soft-delete semantics for DELETE:
 *   - Removes this household_id from the child's household_ids array
 *   - If household_ids becomes empty, sets status="inactive" (true
 *     soft-delete — child is recoverable from the People tab)
 *   - If the child still belongs to other households (divorced /
 *     blended family), status stays active — just dropped from THIS
 *     household's membership. Wording in the UI reflects this:
 *     "Remove from this household" not "Delete child".
 *
 * Audit:
 *   - Every mutation stamps last_edited_by_guardian + guardian_edited_at
 *     on the Person doc
 *   - Audit log entry with `metadata.via: "guardian_portal"` so log
 *     readers can distinguish staff edits from parent self-service
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";

interface PutBody {
  token?: unknown;
  church_id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  preferred_name?: unknown;
  grade?: unknown;
  allergies?: unknown;
  medical_notes?: unknown;
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
]);

/** Resolve household via QR token. Returns the household doc + id or a
 *  401/404 NextResponse. Unified collection only — see POST header. */
async function resolveHousehold(
  churchId: string,
  token: string,
): Promise<
  | { householdId: string; householdRef: FirebaseFirestore.DocumentReference }
  | NextResponse
> {
  const churchRef = adminDb.collection("churches").doc(churchId);
  const hhSnap = await churchRef
    .collection("households")
    .where("qr_token", "==", token)
    .limit(1)
    .get();
  if (hhSnap.empty) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }
  const doc = hhSnap.docs[0];
  return { householdId: doc.id, householdRef: doc.ref };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { childId } = await params;
    const body = (await req.json()) as PutBody;

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const resolved = await resolveHousehold(churchId, token);
    if (resolved instanceof NextResponse) return resolved;
    const { householdId } = resolved;

    const childRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(childId);
    const childSnap = await childRef.get();
    if (!childSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }
    const childData = childSnap.data() ?? {};

    // Cross-tenant + cross-household guards. The token already proves
    // ownership of one household; ensure the target child belongs to
    // it AND lives in the same church.
    if (childData.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (childData.person_type !== "child") {
      return NextResponse.json(
        { error: "Target person is not a child" },
        { status: 400 },
      );
    }
    const childHouseholds = Array.isArray(childData.household_ids)
      ? (childData.household_ids as string[])
      : [];
    if (!childHouseholds.includes(householdId)) {
      return NextResponse.json(
        { error: "Child does not belong to this household" },
        { status: 403 },
      );
    }

    // Build updates. Each field optional; only present fields apply.
    const updates: Record<string, unknown> = {};
    const childProfileUpdates: Record<string, unknown> = {};

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
        typeof body.preferred_name === "string" && body.preferred_name.trim()
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
    // Recompute denormalized name/search_name when first/last changed.
    if ("first_name" in updates || "last_name" in updates) {
      const newFirst = (updates.first_name as string) ?? childData.first_name ?? "";
      const newLast = (updates.last_name as string) ?? childData.last_name ?? "";
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
            { error: `Invalid grade. Must be one of: ${[...VALID_GRADES].join(", ")}` },
            { status: 400 },
          );
        }
        v = g;
      }
      childProfileUpdates.grade = v;
    }
    if ("allergies" in body) {
      const v =
        typeof body.allergies === "string" && body.allergies.trim()
          ? body.allergies.trim().slice(0, 2000)
          : null;
      childProfileUpdates.allergies = v;
    }
    if ("medical_notes" in body) {
      const v =
        typeof body.medical_notes === "string" && body.medical_notes.trim()
          ? body.medical_notes.trim().slice(0, 2000)
          : null;
      childProfileUpdates.medical_notes = v;
    }

    // Recompute has_alerts if either alerts-relevant field touched.
    if ("allergies" in childProfileUpdates || "medical_notes" in childProfileUpdates) {
      const existingCp = (childData.child_profile as Record<string, unknown>) ?? {};
      const finalAllergies =
        "allergies" in childProfileUpdates
          ? childProfileUpdates.allergies
          : existingCp.allergies;
      const finalMedical =
        "medical_notes" in childProfileUpdates
          ? childProfileUpdates.medical_notes
          : existingCp.medical_notes;
      childProfileUpdates.has_alerts = !!(finalAllergies || finalMedical);
    }

    const now = new Date().toISOString();
    updates.last_edited_by_guardian = true;
    updates.guardian_edited_at = now;
    updates.updated_at = now;

    // Merge child_profile updates as dotted-path fields so we don't
    // overwrite siblings (default_room_id, authorized_pickups, etc.).
    for (const [k, v] of Object.entries(childProfileUpdates)) {
      updates[`child_profile.${k}`] = v;
    }

    await childRef.update(updates);

    void audit({
      church_id: churchId,
      actor: SYSTEM_ACTOR,
      action: "checkin.child_updated",
      target_type: "person",
      target_id: childId,
      metadata: {
        via: "guardian_portal",
        household_id: householdId,
        fields: Object.keys(body).filter(
          (k) => k !== "token" && k !== "church_id",
        ),
      },
      outcome: "ok",
    });

    const refreshed = await childRef.get();
    const r = refreshed.data() ?? {};
    const rcp = (r.child_profile as Record<string, unknown>) ?? {};
    return NextResponse.json({
      id: childId,
      first_name: r.first_name,
      last_name: r.last_name,
      preferred_name: r.preferred_name ?? null,
      grade: rcp.grade ?? null,
      allergies: rcp.allergies ?? null,
      medical_notes: rcp.medical_notes ?? null,
      has_alerts: rcp.has_alerts ?? false,
    });
  } catch (error) {
    console.error("[PUT /api/guardian/children/[id]]", error);
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
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { childId } = await params;
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const churchId = req.nextUrl.searchParams.get("church_id") ?? "";
    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const resolved = await resolveHousehold(churchId, token);
    if (resolved instanceof NextResponse) return resolved;
    const { householdId } = resolved;

    const childRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(childId);
    const childSnap = await childRef.get();
    if (!childSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }
    const childData = childSnap.data() ?? {};

    if (childData.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (childData.person_type !== "child") {
      return NextResponse.json(
        { error: "Target person is not a child" },
        { status: 400 },
      );
    }
    const childHouseholds = Array.isArray(childData.household_ids)
      ? (childData.household_ids as string[])
      : [];
    if (!childHouseholds.includes(householdId)) {
      return NextResponse.json(
        { error: "Child does not belong to this household" },
        { status: 403 },
      );
    }

    const remainingHouseholds = childHouseholds.filter((h) => h !== householdId);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      household_ids: remainingHouseholds,
      last_edited_by_guardian: true,
      guardian_edited_at: now,
      updated_at: now,
    };
    // Only flip to inactive when the child has no remaining households.
    // Cross-household kids (divorced / blended) stay active — they're
    // still expected at the OTHER household's check-in.
    let madeInactive = false;
    if (remainingHouseholds.length === 0) {
      updates.status = "inactive";
      madeInactive = true;
    }
    await childRef.update(updates);

    void audit({
      church_id: churchId,
      actor: SYSTEM_ACTOR,
      action: madeInactive
        ? "checkin.child_archived"
        : "checkin.child_unlinked_from_household",
      target_type: "person",
      target_id: childId,
      metadata: {
        via: "guardian_portal",
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
    console.error("[DELETE /api/guardian/children/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
