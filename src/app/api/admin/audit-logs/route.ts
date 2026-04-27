/**
 * GET /api/admin/audit-logs?church_id=...&action=...&actor=...&since=...&limit=...&cursor=...
 *
 * Org-admin paginated read of audit_logs (Track F.3). Backs the Activity
 * page at /dashboard/org/activity. Always scoped to a single church.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function requireOrgAdmin(req: NextRequest, churchId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const memSnap = await adminDb
    .doc(`memberships/${decoded.uid}_${churchId}`)
    .get();
  if (!memSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const role = memSnap.data()?.role as string | undefined;
  const status = memSnap.data()?.status as string | undefined;
  if (status !== "active" || !["owner", "admin"].includes(role ?? "")) {
    return NextResponse.json(
      { error: "Only org admins can view activity" },
      { status: 403 },
    );
  }
  return { uid: decoded.uid };
}

export async function GET(req: NextRequest) {
  const churchId = req.nextUrl.searchParams.get("church_id");
  if (!churchId) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }
  const auth = await requireOrgAdmin(req, churchId);
  if (auth instanceof NextResponse) return auth;

  const action = req.nextUrl.searchParams.get("action");
  const actorPrefix = req.nextUrl.searchParams.get("actor"); // optional, e.g. "user:xxx"
  const since = req.nextUrl.searchParams.get("since"); // ISO
  const limit = Math.min(
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const cursor = req.nextUrl.searchParams.get("cursor"); // last created_at from prior page

  try {
    let q: FirebaseFirestore.Query = adminDb
      .collection("audit_logs")
      .where("church_id", "==", churchId);

    if (action) q = q.where("action", "==", action);
    if (actorPrefix) q = q.where("actor", "==", actorPrefix);
    if (since) q = q.where("created_at", ">=", since);
    q = q.orderBy("created_at", "desc").limit(limit);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor =
      entries.length === limit
        ? (entries[entries.length - 1] as { created_at?: string }).created_at ?? null
        : null;

    return NextResponse.json({ entries, next_cursor: nextCursor });
  } catch (err) {
    console.error("[GET /api/admin/audit-logs]", err);
    // Common cause: missing composite index. Surface a hint.
    return NextResponse.json(
      {
        error: "Internal server error",
        hint: "If this is the first time loading this filter combination, check the Firebase console for a composite index suggestion.",
      },
      { status: 500 },
    );
  }
}
