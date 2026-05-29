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
 * Wave 6 — interval-aware price resolution via Stripe LOOKUP KEYS.
 *
 * Replaces the old env-var Price-ID maps (STRIPE_PRICE_STARTER/GROWTH/PRO).
 * Lookup keys are assigned in the Stripe dashboard on each Price, so Prices can
 * be rotated/replaced without a Vercel env change. Each paid tier has a monthly
 * and an annual Price, keyed `${tier}_${monthly|annual}`.
 *
 * These strings MUST match the lookup keys set on the live (and test) Stripe
 * Prices EXACTLY — a mismatch makes checkout fail with "no price configured".
 * Confirm against the dashboard before shipping.
 */
export type BillingInterval = "month" | "year";

const LOOKUP_KEYS: Record<string, Record<BillingInterval, string>> = {
  starter: { month: "starter_monthly", year: "starter_annual" },
  growth: { month: "growth_monthly", year: "growth_annual" },
  pro: { month: "pro_monthly", year: "pro_annual" },
};

const SUFFIX_TO_INTERVAL: Record<string, BillingInterval> = {
  monthly: "month",
  annual: "year",
};

/** Parse a `${tier}_${monthly|annual}` lookup key into { tier, interval }. */
export function parseLookupKey(
  lookupKey: string | null | undefined,
): { tier: string; interval: BillingInterval } | null {
  if (!lookupKey) return null;
  const m = /^(starter|growth|pro)_(monthly|annual)$/.exec(lookupKey);
  if (!m) return null;
  return { tier: m[1], interval: SUFFIX_TO_INTERVAL[m[2]] };
}

// Module-level cache: lookup key -> Price ID. Lookup keys are stable; the
// underlying Price ID only changes if a Price is rotated in the dashboard,
// which is rare and self-heals on the next cold start.
const _priceIdByLookupKey = new Map<string, string>();

/**
 * Resolve the Stripe Price ID for a (tier, interval) via its lookup key.
 * Returns null if the tier/interval is unknown or no active Price carries that
 * lookup key (e.g. the dashboard Price isn't set up in this Stripe mode yet).
 */
export async function resolvePriceId(
  tier: string,
  interval: BillingInterval,
): Promise<string | null> {
  const key = LOOKUP_KEYS[tier]?.[interval];
  if (!key) return null;
  const cached = _priceIdByLookupKey.get(key);
  if (cached) return cached;
  const res = await stripe.prices.list({
    lookup_keys: [key],
    active: true,
    limit: 1,
  });
  const id = res.data[0]?.id ?? null;
  if (id) _priceIdByLookupKey.set(key, id);
  return id;
}

/**
 * Reverse: a Stripe Price ID (from a webhook subscription item) into { tier,
 * interval }. Prefer the price's own `lookup_key` carried on the webhook
 * payload; this retrieve is the robust fallback when that field is absent.
 */
export async function resolveTierAndInterval(
  priceId: string,
): Promise<{ tier: string; interval: BillingInterval } | null> {
  const price = await stripe.prices.retrieve(priceId);
  return parseLookupKey(price.lookup_key);
}

export { TIER_LIMITS } from "@/lib/constants";
