import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { TIER_LIMITS } from "@/lib/constants";
import type { SubscriptionTier } from "@/lib/types";

/**
 * Server-side counterpart to the UI's <TierGateBoundary> (Pass A Phase 6).
 * Defense-in-depth: every API route under a tier-gated module subtree
 * must call this helper to verify the caller's church tier unlocks the
 * module. The UI gate alone is insufficient because a sophisticated
 * Free-tier user can call APIs directly via curl/Postman/browser DevTools.
 *
 * Pass G Phase 1 added this helper to close the Sev 4 paywall bypass
 * Codex caught in CODEX_PHASE_6_PASS_A_FULL_RETEST.md.
 */

export type GatedModuleId = "rooms" | "checkin" | "worship";

const MODULE_FLAGS: Record<GatedModuleId, keyof (typeof TIER_LIMITS)["free"]> = {
  rooms: "rooms_enabled",
  checkin: "checkin_enabled",
  worship: "worship_enabled",
};

const TIER_ORDER: SubscriptionTier[] = [
  "free",
  "starter",
  "growth",
  "pro",
  "enterprise",
];

function firstUnlockingTier(module: GatedModuleId): SubscriptionTier {
  const flag = MODULE_FLAGS[module];
  for (const tier of TIER_ORDER) {
    if (TIER_LIMITS[tier]?.[flag] === true) return tier;
  }
  return "growth";
}

export interface ModuleTierContext {
  userId: string;
  churchId: string;
  tier: SubscriptionTier;
  /** Caller's role in the church. Empty string when allowAnonymous is set. */
  role: string;
}

export type ModuleTierResult =
  | { ok: true; ctx: ModuleTierContext }
  | { ok: false; response: NextResponse };

export interface RequireModuleTierOptions {
  /**
   * Where to read `church_id` from. Defaults to "query" (req.nextUrl.searchParams).
   * Use "body" for routes that take church_id in the JSON body.
   */
  churchIdFrom?: "query" | "body";
  /**
   * Override the param/field name. Defaults to "church_id".
   */
  churchIdKey?: string;
  /**
   * If true, skips the membership check. Use ONLY for routes that intentionally
   * serve unauthenticated callers (kiosk, guardian, public) but still need to
   * verify the target church's tier supports the module. The userId in the
   * returned ctx will be empty string in that case.
   */
  allowAnonymous?: boolean;
}

/**
 * Enforces auth + membership + module tier check for an API route.
 *
 * Returns either { ok: true, ctx } (caller proceeds with handler logic)
 * or { ok: false, response } (caller returns the response immediately).
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const gate = await requireModuleTier(req, "rooms");
 *     if (!gate.ok) return gate.response;
 *     const { userId, churchId, tier } = gate.ctx;
 *     // ... handler logic
 *   }
 *
 * For routes taking church_id in the body:
 *   const gate = await requireModuleTier(req, "rooms", { churchIdFrom: "body" });
 *
 * For anonymous-allowed kiosk/guardian routes (still tier-gates the church):
 *   const gate = await requireModuleTier(req, "checkin", { allowAnonymous: true });
 */
export async function requireModuleTier(
  req: NextRequest,
  module: GatedModuleId,
  options: RequireModuleTierOptions = {},
): Promise<ModuleTierResult> {
  const allowAnonymous = options.allowAnonymous === true;
  let userId = "";

  // 1. Auth (skip if anonymous-allowed)
  if (!allowAnonymous) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      userId = decoded.uid;
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      };
    }
  }

  // 2. Resolve churchId
  const key = options.churchIdKey ?? "church_id";
  const source = options.churchIdFrom ?? "query";
  let churchId: string | null = null;
  if (source === "query") {
    churchId = req.nextUrl.searchParams.get(key);
  } else {
    try {
      const body = await req.clone().json();
      churchId = body?.[key] ?? null;
    } catch {
      churchId = null;
    }
  }
  if (!churchId) {
    return {
      ok: false,
      response: NextResponse.json({ error: `Missing ${key}` }, { status: 400 }),
    };
  }

  // 3. Membership check (skip if anonymous-allowed)
  let role = "";
  if (!allowAnonymous) {
    const memSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
      .get();
    if (!memSnap.exists) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Not a member" }, { status: 403 }),
      };
    }
    role = (memSnap.data()?.role as string) || "";
  }

  // 4. Church + tier lookup
  const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
  if (!churchSnap.exists) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      ),
    };
  }
  const tier =
    (churchSnap.data()!.subscription_tier as SubscriptionTier) || "free";

  // 5. Module gate
  const flag = MODULE_FLAGS[module];
  if (TIER_LIMITS[tier]?.[flag] !== true) {
    const requiredTier = firstUnlockingTier(module);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `This feature requires the ${requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} tier or higher.`,
          required_tier: requiredTier,
          module,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, ctx: { userId, churchId, tier, role } };
}
