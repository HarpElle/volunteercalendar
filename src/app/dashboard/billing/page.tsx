"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRICING_TIERS, TIER_LIMITS } from "@/lib/constants";
import type { Church, Volunteer, Ministry } from "@/lib/types";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function BillingPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const churchId = profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [ministryCount, setMinistryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [churchSnap, vols, mins] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        if (churchSnap.exists()) {
          setChurch({ id: churchSnap.id, ...churchSnap.data() } as unknown as Church);
        }
        setVolunteerCount((vols as unknown as Volunteer[]).length);
        setMinistryCount((mins as unknown as Ministry[]).length);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId, tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setPortalLoading(false);
    }
  }

  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const volNearLimit =
    limits.volunteers !== Infinity && volunteerCount >= limits.volunteers * 0.8;
  const minNearLimit =
    limits.ministries !== Infinity && ministryCount >= limits.ministries * 0.8;

  if (loading) {
    return (
      <div className="py-16 text-center text-vc-text-muted">Loading...</div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">
          Billing & Plan
        </h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your subscription and view usage.
        </p>
      </div>

      {/* Success / Cancel banners */}
      {success && (
        <div className="mb-6 rounded-lg bg-vc-sage/10 border border-vc-sage/30 px-4 py-3 text-sm text-vc-sage font-medium">
          Subscription activated! Your plan has been updated.
        </div>
      )}
      {canceled && (
        <div className="mb-6 rounded-lg bg-vc-sand/20 border border-vc-sand/30 px-4 py-3 text-sm text-vc-text-secondary">
          Checkout was canceled. You can try again anytime.
        </div>
      )}

      {/* Current plan card */}
      <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold text-vc-indigo">
                Current Plan
              </h2>
              <Badge
                variant={currentTier === "free" ? "default" : "success"}
              >
                {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-vc-text-secondary">
              {PRICING_TIERS.find((t) => t.tier === currentTier)?.price || "$0"}{" "}
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-vc-bg-warm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-vc-text-secondary">
                Volunteers
              </span>
              <span className="text-sm font-semibold text-vc-indigo">
                {volunteerCount} /{" "}
                {limits.volunteers === Infinity ? "∞" : limits.volunteers}
              </span>
            </div>
            <div className="h-2 rounded-full bg-vc-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  volNearLimit ? "bg-vc-coral" : "bg-vc-sage"
                }`}
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
                Ministries
              </span>
              <span className="text-sm font-semibold text-vc-indigo">
                {ministryCount} /{" "}
                {limits.ministries === Infinity ? "∞" : limits.ministries}
              </span>
            </div>
            <div className="h-2 rounded-full bg-vc-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  minNearLimit ? "bg-vc-coral" : "bg-vc-sage"
                }`}
                style={{
                  width:
                    limits.ministries === Infinity
                      ? "10%"
                      : `${Math.min((ministryCount / limits.ministries) * 100, 100)}%`,
                }}
              />
            </div>
            {minNearLimit && (
              <p className="mt-1 text-xs text-vc-coral">
                Approaching ministry limit
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Plan comparison */}
      <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
        {currentTier === "free" ? "Upgrade Your Plan" : "All Plans"}
      </h2>
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
              className={`rounded-xl border p-5 transition-shadow ${
                plan.highlighted && !isCurrent
                  ? "border-vc-coral/40 bg-vc-coral/5 shadow-sm"
                  : isCurrent
                    ? "border-vc-sage/40 bg-vc-sage/5"
                    : "border-vc-border-light bg-white"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-vc-indigo">{plan.name}</h3>
                {isCurrent && (
                  <Badge variant="success">Current</Badge>
                )}
                {plan.highlighted && !isCurrent && (
                  <Badge variant="warning">Popular</Badge>
                )}
              </div>
              <p className="text-2xl font-bold text-vc-indigo mb-1">
                {plan.price}
              </p>
              <p className="text-xs text-vc-text-muted mb-4">
                {plan.volunteers} volunteers · {plan.ministries}{" "}
                {plan.ministries === "1" ? "ministry" : "ministries"}
              </p>
              <ul className="space-y-1.5 mb-5">
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
                  variant="ghost"
                  className="w-full"
                  onClick={() =>
                    (window.location.href = "mailto:info@volunteercalendar.org")
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
        All paid plans include a 14-day free trial. Annual billing saves 20%.
        Questions?{" "}
        <a
          href="mailto:info@volunteercalendar.org"
          className="text-vc-coral hover:underline"
        >
          Contact us
        </a>
      </p>
    </div>
  );
}
