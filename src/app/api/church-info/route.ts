import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { generateShortCode, SHORT_CODE_RE, resolveShortCode } from "@/lib/utils/short-code";

/**
 * GET /api/church-info?id=xxx
 *
 * Public endpoint — returns basic church info (name, type) for join/invite pages.
 * Accepts a full church_id or a 6-char setup code (short_code).
 * Uses Admin SDK to bypass Firestore rules that restrict client reads to members.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const rawId = req.nextUrl.searchParams.get("id");
  if (!rawId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Try direct doc lookup first, then short code resolution
  let churchId = rawId;
  let snap = await adminDb.doc(`churches/${rawId}`).get();

  if (!snap.exists && SHORT_CODE_RE.test(rawId.toUpperCase())) {
    const resolved = await resolveShortCode(rawId);
    if (resolved) {
      churchId = resolved;
      snap = await adminDb.doc(`churches/${churchId}`).get();
    }
  }

  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = snap.data()!;

  // Backfill short_code for existing churches that don't have one
  let shortCode = data.short_code || null;
  if (!shortCode) {
    try {
      shortCode = await generateShortCode();
      await adminDb.doc(`churches/${churchId}`).update({ short_code: shortCode });
    } catch {
      // Non-critical — will retry on next request
    }
  }

  return NextResponse.json({
    id: snap.id,
    name: data.name || "Organization",
    type: data.type || "church",
    short_code: shortCode,
  });
}
