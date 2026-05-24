import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { generateShortCode, SHORT_CODE_RE, resolveShortCode } from "@/lib/utils/short-code";

/**
 * GET /api/church-info?id=xxx
 *
 * Public endpoint — returns basic church info (name, type) for join/invite pages.
 * Accepts a full church_id or a 6-char setup code (short_code).
 * Uses Admin SDK to bypass Firestore rules that restrict client reads to members.
 *
 * Pass G Phase 2 / §3.4: Setup-code lookup is an enumeration target — without
 * throttling, an attacker can grind the 6-char short-code keyspace. We apply
 * two distributed limits:
 *   1) 100/IP/hour — the primary brute-force defense; clamps a single attacker
 *      regardless of how many distinct codes they try.
 *   2) 20/IP-per-id/hour — extra friction for repeatedly hammering one id, so
 *      a known short_code can't be probed for state changes either.
 */
export async function GET(req: NextRequest) {
  const rawId = req.nextUrl.searchParams.get("id");
  if (!rawId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Primary: per-IP cap to defeat enumeration across many distinct codes.
  const ipLimited = await rateLimitDistributed(req, {
    prefix: "church-info-ip",
    limit: 100,
    windowSeconds: 60 * 60,
    requireDistributed: true,
  });
  if (ipLimited) return ipLimited;

  // Secondary: per-(IP, id) cap so any single code can't be hammered.
  const idLimited = await rateLimitDistributed(req, {
    prefix: "church-info-id",
    limit: 20,
    windowSeconds: 60 * 60,
    extraKey: rawId.toLowerCase().slice(0, 64),
    requireDistributed: true,
  });
  if (idLimited) return idLimited;

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
