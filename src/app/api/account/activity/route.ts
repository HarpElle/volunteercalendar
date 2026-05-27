/**
 * GET /api/account/activity (Wave 4.2 hotfix)
 *
 * Returns the signed-in user's recent auth.* audit_logs entries. Backs
 * the "Security activity" section on /dashboard/account so MFA events
 * (which write with `church_id: null` because they're user-scoped, not
 * org-scoped) are visible somewhere in the UI. /dashboard/settings/activity
 * is hard-scoped to a single church and can't see null-church_id rows.
 *
 * Auth: requireUser. The user can only ever see their own actor:user:{uid}
 * rows; the query is parameterised by the verified token's uid, so no
 * cross-user leakage is possible even with crafted query params.
 *
 * Filter strategy: query by actor (Firestore equality) + orderBy created_at
 * desc + limit. JS-filter to auth.* prefix in the response. At expected
 * scale (single-digit auth events per user per year) this is faster than
 * a composite index on (actor, action, created_at).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertBearerToken, requireUser } from "@/lib/server/authz";
import { log } from "@/lib/log";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(1, parseInt(limitParam ?? "", 10) || DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  try {
    // Pull a slightly wider window than `limit` so the auth.* JS-filter
    // still returns a reasonable count if the user has a lot of other
    // (org-scoped) audit rows interleaved. 3x is plenty for the current
    // scale; can revisit if a power-user fills the buffer.
    const snap = await adminDb
      .collection("audit_logs")
      .where("actor", "==", `user:${user.uid}`)
      .orderBy("created_at", "desc")
      .limit(limit * 3)
      .get();

    const entries = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => {
        const action = (e as { action?: string }).action;
        return typeof action === "string" && action.startsWith("auth.");
      })
      .slice(0, limit);

    return NextResponse.json({ entries });
  } catch (err) {
    log.error("[GET /api/account/activity]", {
      error: err,
      uid: user.uid,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        hint:
          "If this is the first time hitting the auth-activity query, an audit_logs (actor, created_at desc) composite index may need to be created.",
      },
      { status: 500 },
    );
  }
}
