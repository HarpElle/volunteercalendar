"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isOwner } from "@/lib/utils/permissions";
import { PRICING_TIERS, TIER_LIMITS } from "@/lib/constants";
import { getAuth } from "firebase/auth";
import type { Church, Ministry, Membership, SubscriptionSource } from "@/lib/types";

interface BillingSettingsProps {
  churchId: string;
  church: Church;
  setChurch: (church: Church) => void;
  currentTier: string;
  volunteerCount: number;
  activeEventCount: number;
  ministriesCount: number;
  terms: {
    singular: string;
    plural: string;
    singularLower: string;
    pluralLower: string;
  };
  isPlatformSuperadmin: boolean;
  mutationError: string;
  setMutationError: (error: string) => void;
  activeMembership: Membership | null;
  billingSuccess: boolean;
  billingCanceled: boolean;
}

export function BillingSettings({
  churchId,
  church,
  setChurch,
  currentTier,
  volunteerCount,
  activeEventCount,
  ministriesCount,
  terms,
  isPlatformSuperadmin,
  mutationError,
  setMutationError,
  activeMembership,
  billingSuccess,
  billingCanceled,
}: BillingSettingsProps) {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Platform admin state
  const [overrideTier, setOverrideTier] = useState<string>("free");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideSuccess, setOverrideSuccess] = useState("");

  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const volNearLimit =
    limits.volunteers !== Infinity && volunteerCount >= limits.volunteers * 0.8;
  const minNearLimit =
    limits.ministries !== Infinity && ministriesCount >= limits.ministries * 0.8;
  const eventNearLimit =
    limits.active_events !== Infinity &&
    activeEventCount >= limits.active_events * 0.8;
  const subscriptionSource: SubscriptionSource =
    church?.subscription_source || "stripe";

  // --- Billing handlers ---

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setMutationError("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setMutationError("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  // --- Platform admin tier override ---

  async function handleTierOverride(removeOverride = false) {
    setOverrideSaving(true);
    setOverrideSuccess("");
    setMutationError("");
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/tier-override", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          removeOverride
            ? { church_id: churchId, remove_override: true }
            : { church_id: churchId, tier: overrideTier }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update tier");
      }
      const data = await res.json();
      // Refresh church data in local state
      setChurch({
        ...church,
        subscription_tier: data.tier,
        subscription_source: data.source,
      });
      setOverrideSuccess(
        removeOverride
          ? "Override removed -- reverted to Free."
          : `Tier set to ${data.tier}.`
      );
    } catch (err) {
      setMutationError(
        (err as Error).message || "Failed to override tier."
      );
    } finally {
      setOverrideSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Billing banners */}
      {billingSuccess && (
        <div className="rounded-lg bg-vc-sage/10 border border-vc-sage/30 px-4 py-3 text-sm text-vc-sage font-medium">
          Subscription activated! Your plan has been updated.
        </div>
      )}
      {billingCanceled && (
        <div className="rounded-lg bg-vc-sand/20 border border-vc-sand/30 px-4 py-3 text-sm text-vc-text-secondary">
          Checkout was canceled. You can try again anytime.
        </div>
      )}

      {/* ── Platform Admin Override ── */}
      {isPlatformSuperadmin && (
        <section>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-6">
            <div className="mb-3 flex items-center gap-2">
              <svg
                className="h-5 w-5 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                />
              </svg>
              <h2 className="text-lg font-semibold text-amber-800">
                Platform Admin
              </h2>
            </div>
            <p className="mb-4 text-sm text-amber-700">
              Changes here bypass billing and set the subscription tier directly.
            </p>

            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-amber-800">
                Current:
              </span>
              <Badge
                variant={
                  subscriptionSource === "manual" ? "warning" : "default"
                }
              >
                {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
              </Badge>
              <span className="text-xs text-amber-600">
                (
                {subscriptionSource === "manual"
                  ? "Manual Override"
                  : "Stripe"}
                )
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-800">
                  Set Tier
                </label>
                <select
                  value={overrideTier}
                  onChange={(e) => setOverrideTier(e.target.value)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-vc-indigo focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <Button
                size="sm"
                variant="primary"
                loading={overrideSaving}
                onClick={() => handleTierOverride(false)}
              >
                Apply Override
              </Button>
              {subscriptionSource === "manual" && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={overrideSaving}
                  onClick={() => handleTierOverride(true)}
                >
                  Remove Override
                </Button>
              )}
            </div>

            {overrideSuccess && (
              <p className="mt-3 text-sm font-medium text-vc-sage">
                {overrideSuccess}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Billing & Plan ── */}
      {isOwner(activeMembership) && (
        <section id="billing-section">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
            Billing & Plan
          </h2>

          {/* Current plan card */}
          <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-vc-indigo">Current Plan</h3>
                  <Badge
                    variant={currentTier === "free" ? "default" : "success"}
                  >
                    {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                  </Badge>
                </div>
                <p className="text-sm text-vc-text-secondary">
                  {PRICING_TIERS.find((t) => t.tier === currentTier)?.price ||
                    "$0"}{" "}
                  {currentTier !== "free" && "· Billed monthly"}
                </p>
              </div>
              {currentTier !== "free" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePortal}
                  loading={portalLoading}
                >
                  Manage Subscription
                </Button>
              )}
            </div>

            {/* Usage meters */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-vc-bg-warm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-vc-text-secondary">
                    Volunteers
                  </span>
                  <span className="text-sm font-semibold text-vc-indigo">
                    {volunteerCount} /{" "}
                    {limits.volunteers === Infinity
                      ? "\u221E"
                      : limits.volunteers}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-vc-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${volNearLimit ? "bg-vc-coral" : "bg-vc-sage"}`}
                    style={{
                      width:
                        limits.volunteers === Infinity
                          ? "10%"
                          : `${Math.min((volunteerCount / limits.volunteers) * 100, 100)}%`,
                    }}
                  />
                </div>
                {volNearLimit && (
                  <p className="mt-1 text-xs text-vc-coral">
                    Approaching volunteer limit
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-vc-bg-warm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-vc-text-secondary">
                    {terms.plural}
                  </span>
                  <span className="text-sm font-semibold text-vc-indigo">
                    {ministriesCount} /{" "}
                    {limits.ministries === Infinity
                      ? "\u221E"
                      : limits.ministries}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-vc-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${minNearLimit ? "bg-vc-coral" : "bg-vc-sage"}`}
                    style={{
                      width:
                        limits.ministries === Infinity
                          ? "10%"
                          : `${Math.min((ministriesCount / limits.ministries) * 100, 100)}%`,
                    }}
                  />
                </div>
                {minNearLimit && (
                  <p className="mt-1 text-xs text-vc-coral">
                    Approaching {terms.singularLower} limit
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-vc-bg-warm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-vc-text-secondary">
                    Active Events
                  </span>
                  <span className="text-sm font-semibold text-vc-indigo">
                    {activeEventCount} /{" "}
                    {limits.active_events === Infinity
                      ? "\u221E"
                      : limits.active_events}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-vc-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${eventNearLimit ? "bg-vc-coral" : "bg-vc-sage"}`}
                    style={{
                      width:
                        limits.active_events === Infinity
                          ? "10%"
                          : `${Math.min((activeEventCount / limits.active_events) * 100, 100)}%`,
                    }}
                  />
                </div>
                {eventNearLimit && (
                  <p className="mt-1 text-xs text-vc-coral">
                    Approaching event limit
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Plan comparison */}
          <h3 className="mb-4 font-semibold text-vc-indigo">
            {currentTier === "free" ? "Upgrade Your Plan" : "All Plans"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PRICING_TIERS.map((plan) => {
              const isCurrent = plan.tier === currentTier;
              const isDowngrade =
                PRICING_TIERS.findIndex((t) => t.tier === currentTier) >
                PRICING_TIERS.findIndex((t) => t.tier === plan.tier);
              const canCheckout =
                !isCurrent &&
                !isDowngrade &&
                plan.tier !== "free" &&
                plan.tier !== "enterprise";

              return (
                <div
                  key={plan.tier}
                  className={`flex flex-col rounded-xl border p-5 transition-shadow ${
                    plan.highlighted && !isCurrent
                      ? "border-vc-coral/40 bg-vc-coral/5 shadow-sm"
                      : isCurrent
                        ? "border-vc-sage/40 bg-vc-sage/5"
                        : "border-vc-border-light bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-vc-indigo">{plan.name}</h4>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                    {plan.highlighted && !isCurrent && (
                      <Badge variant="warning">Popular</Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-vc-indigo mb-1">
                    {plan.price}
                  </p>
                  <p className="text-xs text-vc-text-muted mb-4">
                    {plan.volunteers} volunteers · {plan.ministries}{" "}
                    {plan.ministries === "1" ? "team" : "teams"}
                  </p>
                  <ul className="space-y-1.5 mb-5 flex-1">
                    {plan.features.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-vc-text-secondary"
                      >
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-vc-sage"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {canCheckout ? (
                    <Button
                      size="sm"
                      variant={plan.highlighted ? "primary" : "outline"}
                      className="w-full"
                      loading={checkoutLoading === plan.tier}
                      onClick={() => handleCheckout(plan.tier)}
                    >
                      {currentTier === "free" ? "Start Free Trial" : "Upgrade"}
                    </Button>
                  ) : plan.tier === "enterprise" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        (window.location.href =
                          "mailto:info@volunteercal.com")
                      }
                    >
                      Contact Us
                    </Button>
                  ) : isCurrent ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      disabled
                    >
                      Current Plan
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-center text-xs text-vc-text-muted">
            All paid plans include a 14-day free trial. Questions?{" "}
            <a
              href="mailto:info@volunteercal.com"
              className="text-vc-coral hover:underline"
            >
              Contact us
            </a>
          </p>
        </section>
      )}
    </div>
  );
}
