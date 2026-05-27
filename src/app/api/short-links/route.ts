import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { validateTargetUrl } from "@/lib/utils/short-link-target";
import { assertBearerToken, requireMembership } from "@/lib/server/authz";
import { parseBody, parseQuery, z } from "@/lib/server/validation";
import { log } from "@/lib/log";

const GetQuerySchema = z.object({
  church_id: z.string().min(1),
});

const CreateBodySchema = z.object({
  church_id: z.string().min(1),
  slug: z.string().min(1),
  target_url: z.string().min(1),
  label: z.string().min(1),
  expires_in_days: z.number().optional(),
});

const PatchBodySchema = z.object({
  church_id: z.string().min(1),
  link_id: z.string().min(1),
  action: z.literal("expire_now"),
});

const DeleteBodySchema = z.object({
  church_id: z.string().min(1),
  link_id: z.string().min(1),
});

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
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const query = parseQuery(req, GetQuerySchema);
  if (query instanceof NextResponse) return query;

  const auth = await requireMembership(req, query.church_id, "admin");
  if (auth instanceof NextResponse) return auth;
  void auth;

  try {
    const snap = await adminDb
      .collection("short_links")
      .where("church_id", "==", query.church_id)
      .orderBy("created_at", "desc")
      .get();

    const links = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ links });
  } catch (err) {
    log.error("GET /api/short-links failed", { error: err, church_id: query.church_id });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/short-links
 * Creates a new short link. Requires scheduler+ role and paid subscription.
 * Body: { church_id, slug, target_url, label, expires_in_days? }
 */
export async function POST(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, CreateBodySchema);
  if (body instanceof NextResponse) return body;

  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;

  const { church_id, slug, target_url, label, expires_in_days } = body;
  const userId = auth.uid;

  try {
    // Validate target URL — relative app paths or trusted-domain URLs only.
    const normalizedTarget = validateTargetUrl(String(target_url));
    if (!normalizedTarget.ok) {
      return NextResponse.json(
        { error: normalizedTarget.error },
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
      target_url: normalizedTarget.value,
      target_kind: normalizedTarget.kind, // "relative" | "volunteercal" | "allowlist"
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
    // Codex PR #31 Phase 6 retest 2026-05-18: the page surfaced only
    // "Internal error" when the tier-limit query missed its composite
    // index, leaving the operator with no useful breadcrumb. Surface the
    // Firestore failed-precondition message (it includes the create-index
    // URL) so the next missing-index lands as a self-explanatory hint
    // instead of an opaque 500.
    const code = (err as { code?: string | number })?.code;
    const message = (err as Error)?.message || "Internal error";
    log.error("POST /api/short-links failed", { error: err, church_id: body.church_id, slug: body.slug });
    // Firebase admin returns "failed-precondition" as the code string for
    // missing composite indexes; the gRPC numeric form is 9.
    if (code === "failed-precondition" || code === 9) {
      return NextResponse.json(
        {
          error:
            "Short-link query needs a composite index. Re-run `firebase deploy --only firestore:indexes` and try again.",
          detail: message,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/short-links
 *
 * Admin-only. Currently supports one action: `{ action: "expire_now" }`
 * which back-dates `expires_at` so the slug starts returning 404. Lets
 * testers verify the expired-link UX without needing to wait days.
 * Codex Phase 6 2026-05-18.
 *
 * Body: { church_id, link_id, action: "expire_now" }
 */
export async function PATCH(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, PatchBodySchema);
  if (body instanceof NextResponse) return body;

  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;
  void auth;

  const { church_id, link_id } = body;

  try {
    const linkRef = adminDb.collection("short_links").doc(link_id);
    const snap = await linkRef.get();
    if (!snap.exists || snap.data()?.church_id !== church_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Back-date by 1s so the `expires_at > now` queries treat it as expired.
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    await linkRef.update({ expires_at: expiredAt });

    return NextResponse.json({ success: true, expires_at: expiredAt });
  } catch (err) {
    log.error("PATCH /api/short-links failed", { error: err, link_id: body.link_id });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/short-links
 * Body: { church_id, link_id }
 */
export async function DELETE(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, DeleteBodySchema);
  if (body instanceof NextResponse) return body;

  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;
  void auth;

  const { church_id, link_id } = body;

  try {
    const linkSnap = await adminDb.doc(`short_links/${link_id}`).get();
    if (!linkSnap.exists || linkSnap.data()?.church_id !== church_id) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    await adminDb.doc(`short_links/${link_id}`).delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error("DELETE /api/short-links failed", { error: err, link_id: body.link_id });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/short-links/check?slug=xxx
 * Public endpoint to check if a slug is available.
 */
