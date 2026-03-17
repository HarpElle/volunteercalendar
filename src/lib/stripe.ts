import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY not set — billing disabled");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-02-25.clover",
});

/**
 * Map Stripe Price IDs to subscription tiers.
 * Set these in .env.local after creating products in Stripe Dashboard.
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
