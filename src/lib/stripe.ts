import Stripe from "stripe";

/**
 * Lazy Stripe SDK instantiation.
 *
 * Codex Run 2 follow-up (2026-05-17): the previous implementation eagerly
 * constructed the Stripe SDK at module-load time. The Stripe constructor
 * throws synchronously if no API key is provided, which crashed Vercel
 * preview builds (and any environment without STRIPE_SECRET_KEY set —
 * fresh clones, CI without billing creds, etc.). The build error
 * "Failed to collect page data for /api/account/delete" was the visible
 * symptom; the underlying cause was the Stripe constructor.
 *
 * The Proxy below defers SDK construction until the first property access
 * on `stripe`. Module-load is now side-effect-free. A real attempt to use
 * Stripe in an environment without credentials throws a clear, actionable
 * error at the call site, not at import.
 */

let _stripeInstance: Stripe | null = null;

function getStripeInstance(): Stripe {
  if (_stripeInstance) return _stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set in this environment. Stripe billing operations are unavailable. Set the env var to enable checkout, portal, and webhook handling.",
    );
  }
  _stripeInstance = new Stripe(key, {
    apiVersion: "2026-02-25.clover",
  });
  return _stripeInstance;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const instance = getStripeInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[
      prop as string | symbol
    ];
    // Bind methods so `this` resolves correctly when called via the proxy.
    // Sub-resources (e.g. `stripe.checkout`) are returned directly; their
    // own methods already have correct `this` because the caller accesses
    // them on the real Stripe instance, not on the proxy.
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});

/**
 * Map Stripe Price IDs to subscription tiers.
 * Set these in .env.local after creating products in Stripe Dashboard.
 *
 * Note: these are evaluated at module-load (cheap string reads). When env
 * vars are missing, the entries collapse to `""` keys — harmless, just
 * means no Price ID will ever match.
 */
export const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER || ""]: "starter",
  [process.env.STRIPE_PRICE_GROWTH || ""]: "growth",
  [process.env.STRIPE_PRICE_PRO || ""]: "pro",
};

export const TIER_TO_PRICE: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  growth: process.env.STRIPE_PRICE_GROWTH || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
};

export { TIER_LIMITS } from "@/lib/constants";
