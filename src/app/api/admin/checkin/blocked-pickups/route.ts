/**
 * Blocked-pickup contacts — admin CRUD (GET + POST).
 *
 * Wave 9 P0-2 sub-PR B. The "Not Authorized" list — people who must NOT
 * take a child / sibling group home. ECAP Indicator-aligned: when a
 * blocked-pickup attempt is detected at checkout, the kiosk pauses
 * the session, alerts the owner + Emergency Response Team via SMS,
 * and the operator on-site CANNOT self-override (per plan decision
 * 2026-05-29).
 *
 * Stored in churches/{churchId}/checkin_blocked_pickups/{id} —
 * separate from `people/{docId}` because that collection is
 * volunteer-readable and custody-order data must not leak. See
 * `firestore.rules` + the foundation PR's STATUS.md deviation note.
 *
 * Photo upload + document_url upload are NOT in scope for this sub-PR
 * (they land with the Storage signed-URL helpers in sub-PR C).
 *
 * Auth:
 *   - Module tier: checkin
 *   - Role: owner / admin only — sensitive surface, no scheduler/volunteer reach.
 *
 * Query parameters:
 *   GET ?church_id=... [&child_id=...] [&household_id=...]
 *     - Without filters: returns the full block list for the church.
 *     - With child_id: returns only blocks that apply to this child
 *       (scope === "child" AND child_id matches) PLUS household-scope
 *       blocks for the household(s) the child belongs to. This is the
 *       query the kiosk's staffed checkout will run.
 *     - With household_id: returns scope === "household" blocks for
 *       that household.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { BlockedPickup } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  scope?: unknown;
  child_id?: unknown;
  household_id?: unknown;
  name?: unknown;
  phone?: unknown;
  reason?: unknown;
  notes?: unknown;
  expires_at?: unknown;
}

const VALID_REASONS = ["court_order", "household_decision", "other"] as const;

export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can view the block list" },
        { status: 403 },
      );
    }

    const childId = req.nextUrl.searchParams.get("child_id");
    const householdId = req.nextUrl.searchParams.get("household_id");

    const colRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups");

    // No filters → full list.
    if (!childId && !householdId) {
      const snap = await colRef.get();
      const blocked = snap.docs.map((d) => d.data() as BlockedPickup);
      return NextResponse.json({ blocked });
    }

    // child_id → child-scope match + household-scope for the child's households.
    if (childId) {
      // Look up the child's household memberships first.
      const childSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("people")
        .doc(childId)
        .get();
      if (!childSnap.exists) {
        return NextResponse.json({ error: "Child not found" }, { status: 404 });
      }
      const child = childSnap.data() ?? {};
      const householdIds: string[] = Array.isArray(child.household_ids)
        ? child.household_ids
        : [];

      // Pull child-scoped blocks for this child.
      const childScopedSnap = await colRef
        .where("scope", "==", "child")
        .where("child_id", "==", childId)
        .get();

      // Pull household-scoped blocks for each household. Firestore allows
      // up to 30 `in` clause values; households for one child stay well under.
      const householdScopedSnaps = householdIds.length
        ? await colRef
            .where("scope", "==", "household")
            .where("household_id", "in", householdIds.slice(0, 30))
            .get()
        : null;

      const blocked: BlockedPickup[] = [
        ...childScopedSnap.docs.map((d) => d.data() as BlockedPickup),
        ...(householdScopedSnaps
          ? householdScopedSnaps.docs.map((d) => d.data() as BlockedPickup)
          : []),
      ];
      return NextResponse.json({ blocked });
    }

    // household_id alone → household-scope match.
    const snap = await colRef
      .where("scope", "==", "household")
      .where("household_id", "==", householdId)
      .get();
    const blocked = snap.docs.map((d) => d.data() as BlockedPickup);
    return NextResponse.json({ blocked });
  } catch (error) {
    log.error("[GET /api/admin/checkin/blocked-pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "body" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage the block list" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as PostBody;
    const scope = body.scope;
    if (scope !== "child" && scope !== "household") {
      return NextResponse.json(
        { error: "scope must be 'child' or 'household'" },
        { status: 400 },
      );
    }

    const childId =
      typeof body.child_id === "string" && body.child_id.trim().length > 0
        ? body.child_id.trim()
        : null;
    const householdId =
      typeof body.household_id === "string" && body.household_id.trim().length > 0
        ? body.household_id.trim()
        : null;

    if (scope === "child" && !childId) {
      return NextResponse.json(
        { error: "child_id is required when scope === 'child'" },
        { status: 400 },
      );
    }
    if (scope === "household" && !householdId) {
      return NextResponse.json(
        { error: "household_id is required when scope === 'household'" },
        { status: 400 },
      );
    }
    if (scope === "child" && householdId) {
      return NextResponse.json(
        { error: "Cannot supply household_id when scope === 'child'" },
        { status: 400 },
      );
    }
    if (scope === "household" && childId) {
      return NextResponse.json(
        { error: "Cannot supply child_id when scope === 'household'" },
        { status: 400 },
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: "name too long (max 200 chars)" },
        { status: 400 },
      );
    }

    const phone =
      typeof body.phone === "string" && body.phone.trim().length > 0
        ? body.phone.trim()
        : null;
    if (phone && phone.length > 30) {
      return NextResponse.json(
        { error: "phone too long (max 30 chars)" },
        { status: 400 },
      );
    }

    const reason = body.reason;
    if (
      typeof reason !== "string" ||
      !VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])
    ) {
      return NextResponse.json(
        { error: `reason must be one of: ${VALID_REASONS.join(", ")}` },
        { status: 400 },
      );
    }

    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;
    if (notes && notes.length > 2000) {
      return NextResponse.json(
        { error: "notes too long (max 2000 chars)" },
        { status: 400 },
      );
    }

    const expiresAt =
      typeof body.expires_at === "string" && body.expires_at.trim().length > 0
        ? body.expires_at.trim()
        : null;
    // Light ISO check; full RFC parsing handled by the UI's date picker.
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
      return NextResponse.json(
        { error: "expires_at must be an ISO date string" },
        { status: 400 },
      );
    }

    // Validate target exists + lives in this church.
    const churchRef = adminDb.collection("churches").doc(churchId);
    if (childId) {
      const childSnap = await churchRef.collection("people").doc(childId).get();
      if (!childSnap.exists) {
        return NextResponse.json(
          { error: "Child not found" },
          { status: 404 },
        );
      }
      const child = childSnap.data() ?? {};
      if (child.church_id !== churchId) {
        return NextResponse.json(
          { error: "Cross-tenant access denied" },
          { status: 403 },
        );
      }
      if (child.person_type !== "child") {
        return NextResponse.json(
          { error: "Target person is not a child" },
          { status: 400 },
        );
      }
    }
    if (householdId) {
      const householdSnap = await churchRef
        .collection("households")
        .doc(householdId)
        .get();
      if (!householdSnap.exists) {
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
      }
      const household = householdSnap.data() ?? {};
      if (household.church_id !== churchId) {
        return NextResponse.json(
          { error: "Cross-tenant access denied" },
          { status: 403 },
        );
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const doc: BlockedPickup = {
      id,
      church_id: churchId,
      scope: scope as "child" | "household",
      child_id: childId,
      household_id: householdId,
      name,
      phone,
      photo_url: null, // sub-PR C wires upload + signed-URL serving
      reason: reason as BlockedPickup["reason"],
      notes,
      document_url: null, // sub-PR C wires upload
      expires_at: expiresAt,
      added_at: now,
      added_by_user_id: userId,
    };

    await churchRef.collection("checkin_blocked_pickups").doc(id).set(doc);

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.blocked_added",
      target_type: "checkin_blocked_pickup",
      target_id: id,
      metadata: {
        scope,
        child_id: childId,
        household_id: householdId,
        reason,
        has_phone: phone !== null,
        has_expiry: expiresAt !== null,
      },
      outcome: "ok",
    });

    return NextResponse.json({ blocked: doc }, { status: 201 });
  } catch (error) {
    log.error("[POST /api/admin/checkin/blocked-pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
