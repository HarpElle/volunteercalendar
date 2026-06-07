/**
 * POST /api/guardian/children
 *
 * Family Portal child creation. Lets a household add a new child
 * remotely without staff involvement — matches industry precedent
 * (KidCheck, PCO Check-Ins, Breeze, etc.) and reduces friction for
 * new families and growing households.
 *
 * Auth: same QR-token pattern as the rest of /api/guardian/* — the
 * token resolves the household + church, and the new Person doc is
 * scoped to that household.
 *
 * Body: { token, church_id, first_name, last_name, preferred_name?,
 *         grade?, allergies?, medical_notes? }
 *
 * Audit stamp: every guardian-initiated mutation tags the resulting
 * Person doc with `last_edited_by_guardian: true` and
 * `guardian_edited_at: ISO`. Admins see a "Edited by guardian" badge
 * (UI follow-up) and the audit log entry is namespaced under the
 * `guardian_portal` actor so it's distinguishable from staff edits.
 *
 * 2026-06-03: legacy `checkin_households` shape is intentionally not
 * supported here — the legacy collection only existed before the
 * unified-people migration and all real production data has moved
 * over. Returns 404 if the token doesn't resolve to a unified
 * household.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";

interface PostBody {
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
  "7th",
]);

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = (await req.json()) as PostBody;

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const firstName =
      typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName =
      typeof body.last_name === "string" ? body.last_name.trim() : "";
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "first_name and last_name are required" },
        { status: 400 },
      );
    }
    if (firstName.length > 100 || lastName.length > 100) {
      return NextResponse.json(
        { error: "Name fields too long (max 100 chars each)" },
        { status: 400 },
      );
    }

    const preferredName =
      typeof body.preferred_name === "string" && body.preferred_name.trim()
        ? body.preferred_name.trim()
        : null;
    if (preferredName && preferredName.length > 100) {
      return NextResponse.json(
        { error: "preferred_name too long (max 100 chars)" },
        { status: 400 },
      );
    }

    let grade: string | null = null;
    if (typeof body.grade === "string" && body.grade.trim()) {
      const g = body.grade.trim();
      if (!VALID_GRADES.has(g)) {
        return NextResponse.json(
          { error: `Invalid grade. Must be one of: ${[...VALID_GRADES].join(", ")}` },
          { status: 400 },
        );
      }
      grade = g;
    }

    const allergies =
      typeof body.allergies === "string" && body.allergies.trim()
        ? body.allergies.trim().slice(0, 2000)
        : null;
    const medicalNotes =
      typeof body.medical_notes === "string" && body.medical_notes.trim()
        ? body.medical_notes.trim().slice(0, 2000)
        : null;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Resolve the household via QR token (unified collection only —
    // legacy `checkin_households` predates the parent self-service
    // surfaces and isn't supported here).
    const hhSnap = await churchRef
      .collection("households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();
    if (hhSnap.empty) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 },
      );
    }
    const householdDoc = hhSnap.docs[0];
    const householdId = householdDoc.id;

    const now = new Date().toISOString();
    const hasAlerts = !!(allergies || medicalNotes);

    const personData: Record<string, unknown> = {
      church_id: churchId,
      person_type: "child",
      first_name: firstName,
      last_name: lastName,
      preferred_name: preferredName,
      name: `${firstName} ${lastName}`,
      search_name: `${firstName} ${lastName}`.toLowerCase(),
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
        date_of_birth: null,
        grade,
        photo_url: null,
        default_room_id: null,
        has_alerts: hasAlerts,
        allergies,
        medical_notes: medicalNotes,
        authorized_pickups: [],
      },
      stats: null,
      imported_from: "guardian_portal",
      background_check: null,
      role_constraints: null,
      volunteer_journey: null,
      qr_token: null,
      // Guardian-edit audit stamps. Distinguishes parent self-service
      // mutations from staff edits in the audit log + admin UI.
      last_edited_by_guardian: true,
      guardian_edited_at: now,
      created_at: now,
      updated_at: now,
    };

    const newRef = await churchRef.collection("people").add(personData);

    void audit({
      church_id: churchId,
      // The guardian portal authenticates via a household-scoped QR
      // token, not a Firebase Auth user. Use SYSTEM_ACTOR with a
      // metadata.via field so log readers can still distinguish.
      actor: SYSTEM_ACTOR,
      action: "checkin.child_created",
      target_type: "person",
      target_id: newRef.id,
      metadata: {
        via: "guardian_portal",
        household_id: householdId,
        has_alerts: hasAlerts,
      },
      outcome: "ok",
    });

    return NextResponse.json(
      {
        id: newRef.id,
        first_name: firstName,
        last_name: lastName,
        preferred_name: preferredName,
        grade,
        allergies,
        medical_notes: medicalNotes,
        has_alerts: hasAlerts,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/guardian/children]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
