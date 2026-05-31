/**
 * Person restrictions — PATCH (lift) + DELETE (alias).
 *
 * Wave 9 P0-3 sub-PR B. Lifts an existing restriction by setting
 * `lifted_at` (and `lifted_by_user_id`). The restriction row stays
 * in the array — we never physically delete restriction records,
 * because the audit trail is the legal artifact ("the church knew,
 * the church re-evaluated, the church lifted on date X").
 *
 * Path-pattern note: flat at `restrictions/[id]/route.ts` with
 * `person_id` in the body to avoid the Next.js 16 bundler bug —
 * see `docs/dev/nextjs-16-bundler-bug.md`.
 *
 * Body:
 *   { church_id, person_id }
 *
 * Auth:
 *   - Bearer JWT
 *   - Owner role only.
 *
 * Idempotent: lifting an already-lifted restriction is a no-op + 200.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { PersonRestriction } from "@/lib/types";

interface PatchBody {
  church_id?: unknown;
  person_id?: unknown;
}

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
      { error: "Only owners can lift restrictions" },
      { status: 403 },
    );
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: restrictionId } = await params;

    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    const body = (await req.json()) as PatchBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const personId =
      typeof body.person_id === "string" ? body.person_id.trim() : "";

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

    const denied = await assertOwner(uid, churchId);
    if (denied) return denied;

    const personRef = adminDb.doc(
      `churches/${churchId}/people/${personId}`,
    );

    const liftedAt = new Date().toISOString();
    let wroteLift = false;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      const existing: PersonRestriction[] = Array.isArray(data.restrictions)
        ? data.restrictions
        : [];
      const idx = existing.findIndex((r) => r.id === restrictionId);
      if (idx === -1) throw new Error("RESTRICTION_NOT_FOUND");
      if (existing[idx].lifted_at) {
        // Idempotent — already lifted.
        return;
      }
      const updated = existing.slice();
      updated[idx] = {
        ...updated[idx],
        lifted_at: liftedAt,
        lifted_by_user_id: uid,
      };
      tx.update(personRef, {
        restrictions: updated,
        updated_at: new Date().toISOString(),
      });
      wroteLift = true;
    });

    if (wroteLift) {
      void audit({
        church_id: churchId,
        actor: userActor(uid),
        action: "volunteer.restriction_lifted",
        target_type: "person",
        target_id: personId,
        metadata: {
          restriction_id: restrictionId,
          lifted_at: liftedAt,
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      restriction_id: restrictionId,
      lifted_at: wroteLift ? liftedAt : null,
      already_lifted: !wroteLift,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PERSON_NOT_FOUND") {
        return NextResponse.json(
          { error: "Person not found" },
          { status: 404 },
        );
      }
      if (error.message === "RESTRICTION_NOT_FOUND") {
        return NextResponse.json(
          { error: "Restriction not found" },
          { status: 404 },
        );
      }
    }
    log.error("[PATCH /api/people/restrictions/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
