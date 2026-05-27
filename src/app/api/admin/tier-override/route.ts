import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { audit } from "@/lib/server/audit";
import type { SubscriptionTier } from "@/lib/types";

const VALID_TIERS: SubscriptionTier[] = [
  "free",
  "starter",
  "growth",
  "pro",
  "enterprise",
];

/**
 * POST /api/admin/tier-override
 * Platform superadmin endpoint to set a church's subscription tier without Stripe.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);

    if (!isPlatformAdmin(decoded.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { church_id, tier, remove_override } = await req.json();

    if (!church_id) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }

    // Handle remove override — revert to stripe-managed
    if (remove_override) {
      const churchRef = adminDb.doc(`churches/${church_id}`);
      const snap = await churchRef.get();
      if (!snap.exists) {
        return NextResponse.json(
          { error: "Church not found" },
          { status: 404 },
        );
      }
      const previousTier = (snap.data()?.subscription_tier as string) ?? "free";
      const previousSource = (snap.data()?.subscription_source as string) ?? "stripe";
      await churchRef.update({
        subscription_tier: "free",
        subscription_source: "stripe",
      });
      // Wave 4.1: platform admin removing a manual override is a
      // tier-change event worth auditing on both axes.
      void audit({
        church_id,
        actor: `platform_admin:${decoded.uid}`,
        action: "platform.tier_override",
        target_type: "church",
        target_id: church_id,
        metadata: {
          mode: "remove_override",
          previous_tier: previousTier,
          previous_source: previousSource,
        },
        outcome: "ok",
      });
      if (previousTier !== "free") {
        void audit({
          church_id,
          actor: `platform_admin:${decoded.uid}`,
          action: "org.tier_change",
          target_type: "church",
          target_id: church_id,
          metadata: {
            from_tier: previousTier,
            to_tier: "free",
            from_source: previousSource,
            to_source: "stripe",
            reason: "platform_admin_remove_override",
          },
          outcome: "ok",
        });
      }
      return NextResponse.json({
        success: true,
        church_id,
        tier: "free",
        source: "stripe",
      });
    }

    // Validate tier
    if (!tier || !VALID_TIERS.includes(tier as SubscriptionTier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}` },
        { status: 400 },
      );
    }

    const churchRef = adminDb.doc(`churches/${church_id}`);
    const snap = await churchRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }
    const previousTier = (snap.data()?.subscription_tier as string) ?? "free";
    const previousSource = (snap.data()?.subscription_source as string) ?? "stripe";

    await churchRef.update({
      subscription_tier: tier,
      subscription_source: "manual",
    });

    // Wave 4.1: dual audit — platform admin action + the org-level
    // tier change consequence. Lets the Activity feed surface both
    // "Jason set Anchor Falls to Pro (manual)" and "Anchor Falls tier
    // changed Pro→Free" as separate filterable events.
    void audit({
      church_id,
      actor: `platform_admin:${decoded.uid}`,
      action: "platform.tier_override",
      target_type: "church",
      target_id: church_id,
      metadata: {
        mode: "set_override",
        from_tier: previousTier,
        to_tier: tier,
        from_source: previousSource,
        to_source: "manual",
      },
      outcome: "ok",
    });
    if (previousTier !== tier) {
      void audit({
        church_id,
        actor: `platform_admin:${decoded.uid}`,
        action: "org.tier_change",
        target_type: "church",
        target_id: church_id,
        metadata: {
          from_tier: previousTier,
          to_tier: tier,
          from_source: previousSource,
          to_source: "manual",
          reason: "platform_admin_set_override",
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      success: true,
      church_id,
      tier,
      source: "manual",
    });
  } catch (error) {
    console.error("[POST /api/admin/tier-override]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
