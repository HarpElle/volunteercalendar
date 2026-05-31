/**
 * Person restrictions — POST.
 *
 * Wave 9 P0-3 sub-PR B. Adds a hard restriction (e.g. "cannot serve
 * with children") to a Person doc's `restrictions[]` array. Owner-only,
 * because restrictions carry legal weight (ECAP Indicator 3.15) and
 * shouldn't be addable by anyone else.
 *
 * Append-only semantics — lifts go through PATCH on
 * `/api/people/restrictions/[id]` (sets `lifted_at`); the restriction
 * row itself stays for the audit trail.
 *
 * Path-pattern note: flat at `restrictions/route.ts` with `person_id`
 * in the body to avoid the Next.js 16 `[param]/static/[param]`
 * bundler bug — see `docs/dev/nextjs-16-bundler-bug.md`.
 *
 * Auth:
 *   - Bearer JWT
 *   - Owner role only (NOT admin / scheduler — restrictions are
 *     legally consequential)
 *
 * Body:
 *   { church_id, person_id, cannot_serve_with_children?, reason, notes? }
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { PersonRestriction } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  person_id?: unknown;
  cannot_serve_with_children?: unknown;
  reason?: unknown;
  notes?: unknown;
}

const ALLOWED_REASONS: PersonRestriction["reason"][] = [
  "sor_match",
  "policy",
  "other",
];

async function authUid(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

async function assertOwner(
  userId: string,
  churchId: string,
): Promise<NextResponse | null> {
  const membershipSnap = await adminDb
    .doc(`memberships/${userId}_${churchId}`)
    .get();
  if (!membershipSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const role = membershipSnap.data()?.role as string | undefined;
  if (role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can manage restrictions" },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    const body = (await req.json()) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const personId =
      typeof body.person_id === "string" ? body.person_id.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const cannotServeWithChildren =
      typeof body.cannot_serve_with_children === "boolean"
        ? body.cannot_serve_with_children
        : true; // default — the v1 flag
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;

    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }
    if (!personId) {
      return NextResponse.json(
        { error: "person_id is required" },
        { status: 400 },
      );
    }
    if (
      !reason ||
      !(ALLOWED_REASONS as string[]).includes(reason)
    ) {
      return NextResponse.json(
        {
          error: `reason must be one of ${ALLOWED_REASONS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (notes && notes.length > 2000) {
      return NextResponse.json(
        { error: "notes too long (max 2000 chars)" },
        { status: 400 },
      );
    }

    const denied = await assertOwner(uid, churchId);
    if (denied) return denied;

    const personRef = adminDb.doc(
      `churches/${churchId}/people/${personId}`,
    );

    const newRestriction: PersonRestriction = {
      id: randomUUID(),
      cannot_serve_with_children: cannotServeWithChildren,
      reason: reason as PersonRestriction["reason"],
      notes,
      documented_by_user_id: uid,
      documented_at: new Date().toISOString(),
      lifted_at: null,
      lifted_by_user_id: null,
    };

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      const existing: PersonRestriction[] = Array.isArray(data.restrictions)
        ? data.restrictions
        : [];
      tx.update(personRef, {
        restrictions: [...existing, newRestriction],
        updated_at: new Date().toISOString(),
      });
    });

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "volunteer.restriction_added",
      target_type: "person",
      target_id: personId,
      metadata: {
        restriction_id: newRestriction.id,
        reason: newRestriction.reason,
        cannot_serve_with_children: newRestriction.cannot_serve_with_children,
      },
      outcome: "ok",
    });

    return NextResponse.json({ restriction: newRestriction }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERSON_NOT_FOUND") {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 },
      );
    }
    log.error("[POST /api/people/restrictions]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
