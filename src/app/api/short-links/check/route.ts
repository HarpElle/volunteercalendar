import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

const RESERVED_SLUGS = new Set([
  "dashboard", "login", "register", "api", "join", "events", "invites",
  "password-reset", "s", "sitemap", "robots", "favicon", "about",
  "pricing", "terms", "privacy", "blog", "help", "support", "admin",
]);

/**
 * GET /api/short-links/check?slug=xxx
 * Public endpoint — checks if a slug is available.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.toLowerCase().trim();
  if (!slug) {
    return NextResponse.json({ available: false, reason: "No slug provided" });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ available: false, reason: "This slug is reserved." });
  }

  const now = new Date().toISOString();
  const snap = await adminDb
    .collection("short_links")
    .where("slug", "==", slug)
    .where("expires_at", ">", now)
    .limit(1)
    .get();

  if (!snap.empty) {
    return NextResponse.json({ available: false, reason: "This slug is already in use." });
  }

  return NextResponse.json({ available: true });
}
