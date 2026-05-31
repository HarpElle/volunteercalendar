/**
 * Person SOR (Sex Offender Registry) check logging — POST.
 *
 * Wave 9 P0-3 sub-PR B. Owners record the outcome of an SOR check.
 * Writes to `Person.background_check.sor_*` fields:
 *   - sor_checked: true
 *   - sor_match: boolean (the check result)
 *   - last_sor_check_at: now
 *
 * If `sor_match === true`, callers SHOULD also POST a restriction
 * via `/api/people/restrictions` with `reason: "sor_match"`. This
 * route does NOT auto-create the restriction — that's a deliberate
 * separation: the SOR check is an evidentiary act ("we ran this
 * check on date X and recorded what we found"), while the
 * restriction is a policy decision ("based on this evidence, the
 * org is excluding this person from children's roles"). Coupling
 * them would obscure the audit trail.
 *
 * Auth:
 *   - Bearer JWT
 *   - Owner role only.
 *
 * Body:
 *   { church_id, person_id, sor_match: boolean, provider?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";

interface PostBody {
  church_id?: unknown;
  person_id?: unknown;
  sor_match?: unknown;
  provider?: unknown;
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
      { error: "Only owners can log SOR checks" },
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
    const sorMatch =
      typeof body.sor_match === "boolean" ? body.sor_match : undefined;
    const provider =
      typeof body.provider === "string" && body.provider.trim().length > 0
        ? body.provider.trim()
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
    if (sorMatch === undefined) {
      return NextResponse.json(
        { error: "sor_match (boolean) is required" },
        { status: 400 },
      );
    }
    if (provider && provider.length > 200) {
      return NextResponse.json(
        { error: "provider too long (max 200 chars)" },
        { status: 400 },
      );
    }

    const denied = await assertOwner(uid, churchId);
    if (denied) return denied;

    const personRef = adminDb.doc(
      `churches/${churchId}/people/${personId}`,
    );

    const checkedAt = new Date().toISOString();

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      const existing = data.background_check ?? {
        status: "not_required",
        expires_at: null,
        provider: null,
        checked_at: null,
      };
      tx.update(personRef, {
        background_check: {
          ...existing,
          sor_checked: true,
          sor_match: sorMatch,
          last_sor_check_at: checkedAt,
          // Capture provider on the sor field, but don't clobber the
          // existing provider if one is already set (the general bg-check
          // provider may differ from the SOR provider).
          provider: provider || existing.provider || null,
        },
        updated_at: new Date().toISOString(),
      });
    });

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "volunteer.sor_check_logged",
      target_type: "person",
      target_id: personId,
      metadata: {
        sor_match: sorMatch,
        checked_at: checkedAt,
        provider,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      ok: true,
      sor_match: sorMatch,
      last_sor_check_at: checkedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PERSON_NOT_FOUND") {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 },
      );
    }
    log.error("[POST /api/people/sor-check]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
