/**
 * Server-side authorization primitives.
 *
 * This module is the single source of truth for who-can-do-what on every
 * non-public API route. Routes call one of the `require*` helpers and either
 * receive the authorized principal or a NextResponse to return immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifyKioskToken } from "@/lib/server/kiosk";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { audit, kioskActor } from "@/lib/server/audit";
import { stripe } from "@/lib/stripe";
import type { KioskScope, OrgRole } from "@/lib/types";
import { log } from "@/lib/log";
import type Stripe from "stripe";

// ─── Kiosk token ────────────────────────────────────────────────────────────

export interface KioskPrincipal {
  /** "station" = real per-device token; "bootstrap" = legacy env-var fallback. */
  mode: "station" | "bootstrap";
  /** Bound church_id; clients MUST NOT supply their own. Null in bootstrap mode if env-bound church not set. */
  church_id: string | null;
  station_id: string | null;
  scope: KioskScope[];
}

const ALL_SCOPES: KioskScope[] = [
  "lookup",
  "checkin",
  "checkout",
  "register",
  "print",
  "services",
  "room",
];

/**
 * Verify a kiosk request. Returns the principal on success, or a NextResponse
 * to short-circuit on failure.
 *
 * Resolution order:
 *   1. `X-Kiosk-Token` header in `${tokenId}.${secret}` form — looked up in
 *      Firestore against `kiosk_tokens` (Track B real station auth).
 *   2. `X-Kiosk-Token` matches `KIOSK_BOOTSTRAP_TOKEN` env — emergency
 *      fallback, useful during migrations or as an admin override.
 *   3. Otherwise — 401.
 *
 * If neither real tokens nor a bootstrap secret are configured (i.e. no
 * stations enrolled and `KIOSK_BOOTSTRAP_TOKEN` unset), every kiosk request
 * 401s. That is the intended safe-by-default state — nothing is open until
 * an admin explicitly enrolls a station.
 */
export async function requireKioskToken(
  req: NextRequest,
  scope: KioskScope,
): Promise<KioskPrincipal | NextResponse> {
  const presented = req.headers.get("x-kiosk-token");
  if (!presented) {
    return NextResponse.json(
      { error: "Missing kiosk token. Send X-Kiosk-Token header." },
      { status: 401 },
    );
  }

  // 1. Real station token (Track B): contains a "." separator.
  if (presented.includes(".") && presented.startsWith("kt_")) {
    const verified = await verifyKioskToken(presented);
    if (verified && verified.station.church_id) {
      // P0-1: enforce the token's actual persisted scope (derived from
      // station type at activation). Previously this was hardcoded to
      // ALL_SCOPES, which masked the per-station narrowing — now a
      // self-service kiosk's token genuinely cannot authorize "checkout".
      const principal: KioskPrincipal = {
        mode: "station",
        church_id: verified.station.church_id,
        station_id: verified.station.id,
        scope: verified.scope,
      };
      if (!principal.scope.includes(scope)) {
        // Defense-in-depth audit: a self-service kiosk that somehow tried
        // to call a checkout route is worth recording. Cheap signal — the
        // UI hides the Check Out button so this should never fire under
        // normal use.
        if (scope === "checkout") {
          void audit({
            church_id: verified.station.church_id,
            actor: kioskActor(verified.station.id),
            action: "kiosk.checkout_blocked_self_service",
            target_type: "kiosk_station",
            target_id: verified.station.id,
            metadata: {
              station_type: verified.station.type ?? "staffed",
            },
            outcome: "denied",
          });
        }
        return NextResponse.json(
          { error: `Token does not authorize ${scope}` },
          { status: 403 },
        );
      }
      return principal;
    }
    // Token format looked right but didn't verify — fall through to 401.
    return NextResponse.json(
      { error: "Invalid kiosk token" },
      { status: 401 },
    );
  }

  // 2. Bootstrap fallback (legacy / emergency).
  const bootstrap = process.env.KIOSK_BOOTSTRAP_TOKEN;
  if (bootstrap) {
    const a = Buffer.from(presented);
    const b = Buffer.from(bootstrap);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return {
        mode: "bootstrap",
        church_id: process.env.KIOSK_BOOTSTRAP_CHURCH_ID ?? null,
        station_id: null,
        scope: ALL_SCOPES,
      };
    }
  }

  return NextResponse.json({ error: "Invalid kiosk token" }, { status: 401 });
}

// ─── Cron secret (Track D.6) ────────────────────────────────────────────────

/**
 * Verify a Vercel cron / internal scheduled request's authorization. Fails
 * closed: if `CRON_SECRET` env var is unset, every cron route 503s. If the
 * presented header is missing or doesn't match, 401. Constant-time compare.
 *
 * Accepts EITHER of two secrets:
 *   - `CRON_SECRET`        — the primary, used by Vercel's scheduled
 *                            cron invocations + any internal automation
 *   - `CODEX_CRON_SECRET`  — optional, separately-rotatable secret for
 *                            Codex's QA harness. Lets Jason share a
 *                            cron-invoke credential without exposing the
 *                            primary, and revoke independently if needed.
 *                            Unset by default; the route works exactly
 *                            as before until the env var is configured.
 *
 * Accepts EITHER of two header shapes (W12-C Codex retest hotfix):
 *   - `Authorization: Bearer <secret>` — Vercel's canonical scheduled-
 *     cron contract; what production traffic uses.
 *   - `x-cron-secret: <secret>` — what the internal /api/reminders
 *     chain already sends (the codebase had two divergent cron-auth
 *     shapes); also the shape Codex's QA harness sends. Adding this
 *     here unifies the contract so a manual curl with either header
 *     works without surprising no-op 401s.
 *
 * Security: same timing-safe compare runs against whichever header
 * was supplied. No length-extension risk; no signal that one header
 * "matched" before the secret compare. If both headers are present,
 * Authorization wins (matches Vercel's behavior on real traffic).
 *
 * Use at the top of every route under /api/cron/*.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const primary = process.env.CRON_SECRET;
  if (!primary) {
    return NextResponse.json(
      { error: "Cron not configured (CRON_SECRET env var missing)" },
      { status: 503 },
    );
  }
  const authHeader =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const xCronHeader = req.headers.get("x-cron-secret") ?? "";
  // Authorization wins when both are present — matches what real
  // Vercel cron traffic will look like on the rare day Codex testing
  // and a scheduled invocation overlap.
  const presented = authHeader || xCronHeader;
  const presentedBuf = Buffer.from(presented);

  // Constant-time compare against each accepted secret. Loop the full
  // list (not short-circuit on first match) so a timing observer can't
  // tell which secret matched.
  const accepted = [primary];
  const codex = process.env.CODEX_CRON_SECRET;
  if (codex) accepted.push(codex);

  let matched = false;
  for (const candidate of accepted) {
    const candBuf = Buffer.from(candidate);
    if (
      candBuf.length === presentedBuf.length &&
      timingSafeEqual(candBuf, presentedBuf)
    ) {
      matched = true;
      // Don't break — full iteration keeps timing uniform
    }
  }
  if (!matched) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ─── Fast auth-header pre-check (Wave 3.3) ──────────────────────────────────

/**
 * Cheap pre-check: returns a 401 NextResponse if no `Authorization: Bearer`
 * header is present. Does NOT verify the token (use `requireUser` for that).
 *
 * Purpose: keep the existing "401 before 400" response ordering for routes
 * that need to call `parseBody` (which reads body before validating auth) to
 * extract a church_id for `requireMembership`. Without this fast-path, a
 * caller with no token + no body would receive 400 instead of 401 — a
 * subtle behavior regression that breaks defensive client code and leaks
 * a hint about the body shape before authenticating.
 *
 * Usage pattern when route auth depends on body fields:
 *
 *   const noAuth = assertBearerToken(req);
 *   if (noAuth) return noAuth;            // 401 if header missing
 *   const body = await parseBody(req, S); // 400 if body bad
 *   if (body instanceof NextResponse) return body;
 *   const auth = await requireMembership(req, body.church_id, "admin");
 *   if (auth instanceof NextResponse) return auth;  // 401/403 from full verify
 *
 * Routes whose auth doesn't need body fields can skip this and use
 * `requireUser` / `requireMembership` / `requirePlatformAdmin` directly —
 * those already 401 first on missing header.
 */
export function assertBearerToken(req: NextRequest): NextResponse | null {
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ─── User auth (Wave 3.1) ───────────────────────────────────────────────────

export interface AuthedUser {
  uid: string;
  email: string | null;
  /** Raw decoded ID-token claims for callers that need extras (custom claims, name, etc.). */
  claims: Record<string, unknown>;
}

/**
 * Verify a Firebase ID token from `Authorization: Bearer <token>` and return
 * the decoded user, or a 401 NextResponse on failure. Use as the first line
 * of every authenticated route — composes into requireMembership /
 * requirePlatformAdmin below.
 *
 * Existing routes that handle this inline can migrate by replacing the
 * 5-line auth block with:
 *
 *   const auth = await requireUser(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // ... use auth.uid, auth.email, auth.claims
 */
export async function requireUser(
  req: NextRequest,
): Promise<AuthedUser | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return {
      uid: decoded.uid,
      email: (decoded.email as string | undefined) ?? null,
      claims: decoded as unknown as Record<string, unknown>,
    };
  } catch (err) {
    log.warn("requireUser token verification failed", { error: err });
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

// ─── Membership-gated routes (Wave 3.1) ─────────────────────────────────────

/**
 * Role hierarchy used for `minRole` threshold checks. Higher number = more
 * privileged. owner > admin > scheduler > volunteer.
 */
const ROLE_RANK: Record<OrgRole, number> = {
  volunteer: 0,
  scheduler: 1,
  admin: 2,
  owner: 3,
};

export interface AuthedMembership extends AuthedUser {
  /** The church the membership is scoped to. */
  church_id: string;
  /** Deterministic doc id format `${uid}_${churchId}`. */
  membership_id: string;
  role: OrgRole;
  /** Always "active" — non-active memberships short-circuit with 403 above. */
  status: "active";
  /**
   * Optional ministry-scope restriction for schedulers. Empty = "all
   * ministries" (no restriction); populated = only these ministry IDs.
   * Always present (defaults to []); callers check by .length === 0.
   */
  ministry_scope: string[];
}

/**
 * Verify auth + membership + role threshold for `churchId`. Returns the
 * membership info on success, or a NextResponse (401 missing token / 403
 * not-a-member / 403 wrong role / 403 inactive membership) on failure.
 *
 * `minRole` defaults to "volunteer" — i.e., any active member of the
 * church passes. Pass "admin" / "owner" / "scheduler" to require higher.
 */
export async function requireMembership(
  req: NextRequest,
  churchId: string,
  minRole: OrgRole = "volunteer",
): Promise<AuthedMembership | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  const membershipId = `${user.uid}_${churchId}`;
  const snap = await adminDb.doc(`memberships/${membershipId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const data = snap.data() ?? {};
  const role = data.role as OrgRole | undefined;
  const status = data.status as string | undefined;

  if (status !== "active") {
    return NextResponse.json(
      { error: "Membership is not active" },
      { status: 403 },
    );
  }
  if (!role || ROLE_RANK[role] === undefined) {
    return NextResponse.json(
      { error: "Membership has no recognized role" },
      { status: 403 },
    );
  }
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    return NextResponse.json(
      { error: `Insufficient role: ${minRole} or higher required` },
      { status: 403 },
    );
  }

  return {
    ...user,
    church_id: churchId,
    membership_id: membershipId,
    role,
    status: "active",
    ministry_scope: (data.ministry_scope as string[]) ?? [],
  };
}

// ─── Platform admin (Wave 3.1) ──────────────────────────────────────────────

export interface AuthedPlatformAdmin extends AuthedUser {
  is_platform_admin: true;
}

/**
 * Verify auth + platform-admin status (env-var UID whitelist via
 * `isPlatformAdmin`). 401 on missing/invalid token, 403 on
 * authenticated-but-not-platform-admin.
 *
 * Use on every /api/platform/* route. The membership-based
 * `requireMembership` is for org-scoped admin; this is for cross-org
 * platform admin (Jason et al.).
 */
export async function requirePlatformAdmin(
  req: NextRequest,
): Promise<AuthedPlatformAdmin | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  if (!isPlatformAdmin(user.uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { ...user, is_platform_admin: true };
}

// ─── Stripe webhook signature verification (Wave 3.1) ───────────────────────

export interface VerifiedStripeWebhook {
  event: Stripe.Event;
  /** Raw request body string — Stripe-verified, safe to use directly. */
  rawBody: string;
}

/**
 * Verify a Stripe webhook's signature using `STRIPE_WEBHOOK_SECRET`.
 * Returns the parsed event + raw body on success, or a NextResponse on
 * failure (503 if Stripe isn't configured, 400 on bad signature).
 *
 * Reads `req.text()` internally — caller MUST NOT have consumed the body
 * already. Stripe signature verification requires the exact raw payload
 * Stripe sent, character-for-character; deserialization corrupts it.
 *
 * Use at the top of every Stripe webhook route. Replaces the inline
 * try/catch block in /api/billing/webhook (and any future webhook routes).
 */
export async function requireStripeWebhook(
  req: NextRequest,
): Promise<VerifiedStripeWebhook | NextResponse> {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  try {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
    return { event, rawBody };
  } catch (err) {
    log.error("Stripe webhook signature verification failed", { error: err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
}

// ─── Kiosk (existing) ───────────────────────────────────────────────────────

/**
 * Enforce that the request's church_id matches the kiosk's bound church_id.
 * In bootstrap mode without an env-bound church, falls back to trusting the
 * client (with a server-log warning). With a real station token, the kiosk's
 * bound church is authoritative.
 */
export function assertKioskChurchMatch(
  principal: KioskPrincipal,
  clientChurchId: string | undefined | null,
): NextResponse | null {
  if (!clientChurchId) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }
  if (principal.church_id && principal.church_id !== clientChurchId) {
    return NextResponse.json(
      { error: "Kiosk not authorized for this church" },
      { status: 403 },
    );
  }
  if (!principal.church_id) {
    log.warn(
      "Kiosk request used unbound bootstrap token; trusting client church_id. " +
        "Set KIOSK_BOOTSTRAP_CHURCH_ID or migrate to a real station token.",
      { client_church_id: clientChurchId },
    );
  }
  return null;
}
