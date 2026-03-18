import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/** Slugs reserved by the app's own routes. */
const RESERVED_SLUGS = new Set([
  "dashboard", "login", "register", "api", "join", "events", "invites",
  "password-reset", "s", "sitemap", "robots", "favicon", "about",
  "pricing", "terms", "privacy", "blog", "help", "support", "admin",
]);

/** Max short links per subscription tier per rolling 30-day window. */
const TIER_LIMITS: Record<string, number> = {
  free: 0,
  starter: 3,
  growth: 10,
  pro: 25,
  enterprise: 100,
};

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
const MAX_EXPIRY_DAYS = 90;
const DEFAULT_EXPIRY_DAYS = 30;

/**
 * GET /api/short-links?church_id=xxx
 * Lists active short links for a church.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership
    const memSnap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
    if (!memSnap.exists || !["owner", "admin"].includes(memSnap.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("short_links")
      .where("church_id", "==", churchId)
      .orderBy("created_at", "desc")
      .get();

    const links = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ links });
  } catch (err) {
    console.error("GET /api/short-links error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/short-links
 * Creates a new short link. Requires scheduler+ role and paid subscription.
 * Body: { church_id, slug, target_url, label, expires_in_days? }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, slug, target_url, label, expires_in_days } = body;

    if (!church_id || !slug || !target_url || !label) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, slug, target_url, label" },
        { status: 400 },
      );
    }

    // Validate slug format
    const normalizedSlug = slug.toLowerCase().trim();
    if (!SLUG_REGEX.test(normalizedSlug)) {
      return NextResponse.json(
        { error: "Slug must be 3-50 characters, lowercase letters, numbers, and hyphens only." },
        { status: 400 },
      );
    }

    if (RESERVED_SLUGS.has(normalizedSlug)) {
      return NextResponse.json(
        { error: "This slug is reserved. Please choose a different one." },
        { status: 409 },
      );
    }

    // Verify membership (admin+ only for short link creation)
    const memSnap = await adminDb.doc(`memberships/${userId}_${church_id}`).get();
    if (!memSnap.exists || !["owner", "admin"].includes(memSnap.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify subscription tier
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const tier = churchSnap.data()?.subscription_tier || "free";
    const limit = TIER_LIMITS[tier] ?? 0;
    if (limit === 0) {
      return NextResponse.json(
        { error: "Short links are available on paid plans. Upgrade to create short links." },
        { status: 403 },
      );
    }

    // Check tier usage (active, non-expired links)
    const now = new Date().toISOString();
    const activeSnap = await adminDb
      .collection("short_links")
      .where("church_id", "==", church_id)
      .where("expires_at", ">", now)
      .get();

    if (activeSnap.size >= limit) {
      return NextResponse.json(
        { error: `Your ${tier} plan allows ${limit} active short links. Delete an existing link to create a new one.` },
        { status: 403 },
      );
    }

    // Check slug uniqueness globally
    const existingSnap = await adminDb
      .collection("short_links")
      .where("slug", "==", normalizedSlug)
      .where("expires_at", ">", now)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return NextResponse.json(
        { error: "This slug is already in use. Please choose a different one." },
        { status: 409 },
      );
    }

    // Calculate expiry
    const days = Math.min(Math.max(expires_in_days || DEFAULT_EXPIRY_DAYS, 1), MAX_EXPIRY_DAYS);
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    const docRef = await adminDb.collection("short_links").add({
      church_id,
      slug: normalizedSlug,
      target_url,
      label,
      created_by: userId,
      created_at: now,
      expires_at: expiresAt,
    });

    return NextResponse.json({
      id: docRef.id,
      slug: normalizedSlug,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("POST /api/short-links error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/short-links
 * Body: { church_id, link_id }
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, link_id } = body;

    if (!church_id || !link_id) {
      return NextResponse.json({ error: "Missing church_id or link_id" }, { status: 400 });
    }

    // Verify membership
    const memSnap = await adminDb.doc(`memberships/${userId}_${church_id}`).get();
    if (!memSnap.exists || !["owner", "admin"].includes(memSnap.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify link belongs to this church
    const linkSnap = await adminDb.doc(`short_links/${link_id}`).get();
    if (!linkSnap.exists || linkSnap.data()?.church_id !== church_id) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    await adminDb.doc(`short_links/${link_id}`).delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/short-links error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/short-links/check?slug=xxx
 * Public endpoint to check if a slug is available.
 */
