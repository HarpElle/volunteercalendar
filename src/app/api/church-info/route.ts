import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";

/**
 * GET /api/church-info?id=xxx
 *
 * Public endpoint — returns basic church info (name, type) for join/invite pages.
 * Uses Admin SDK to bypass Firestore rules that restrict client reads to members.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const churchId = req.nextUrl.searchParams.get("id");
  if (!churchId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const snap = await adminDb.doc(`churches/${churchId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = snap.data()!;
  return NextResponse.json({
    id: snap.id,
    name: data.name || "Organization",
    type: data.type || "church",
    short_code: data.short_code || null,
  });
}
