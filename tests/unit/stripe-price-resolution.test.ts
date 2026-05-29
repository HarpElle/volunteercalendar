/**
 * Wave 6 — interval-aware Stripe price resolution via lookup keys.
 *
 * Locks the resolver logic in src/lib/stripe.ts:
 *   - resolvePriceId(tier, interval) requests the correct lookup key,
 *   - returns the matching active Price ID,
 *   - caches per lookup key (no redundant list calls),
 *   - returns null for an unknown tier/interval,
 *   - resolveTierAndInterval(priceId) reverses a Price's lookup_key.
 *
 * The Stripe SDK is mocked at the package boundary so these run with no
 * network and no real credentials.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted above module-scope consts, so the mock fns must be created
// via vi.hoisted to exist when the (also-hoisted) factory runs.
const { list, retrieve } = vi.hoisted(() => ({
  list: vi.fn(),
  retrieve: vi.fn(),
}));

// `new Stripe(...)` must be constructable — a class instance exposes the
// mocked `prices` sub-resource the lazy proxy reads.
vi.mock("stripe", () => ({
  default: class MockStripe {
    prices = { list, retrieve };
  },
}));

describe("stripe price resolution (lookup keys)", () => {
  beforeEach(() => {
    // Fresh module per test so the module-level price-id cache resets.
    vi.resetModules();
    list.mockReset();
    retrieve.mockReset();
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_test";
  });

  it("requests the correct lookup key and returns the Price ID", async () => {
    list.mockResolvedValue({ data: [{ id: "price_starter_yr" }] });
    const { resolvePriceId } = await import("@/lib/stripe");
    const id = await resolvePriceId("starter", "year");
    expect(id).toBe("price_starter_yr");
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ lookup_keys: ["starter_annual"], active: true }),
    );
  });

  it("maps monthly interval to the _monthly lookup key", async () => {
    list.mockResolvedValue({ data: [{ id: "price_pro_mo" }] });
    const { resolvePriceId } = await import("@/lib/stripe");
    await resolvePriceId("pro", "month");
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ lookup_keys: ["pro_monthly"] }),
    );
  });

  it("caches by lookup key — a repeat call does not re-list", async () => {
    list.mockResolvedValue({ data: [{ id: "price_growth_mo" }] });
    const { resolvePriceId } = await import("@/lib/stripe");
    await resolvePriceId("growth", "month");
    await resolvePriceId("growth", "month");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("returns null for an unknown tier without calling Stripe", async () => {
    const { resolvePriceId } = await import("@/lib/stripe");
    const id = await resolvePriceId("bogus", "month");
    expect(id).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("returns null when no active Price carries the lookup key", async () => {
    list.mockResolvedValue({ data: [] });
    const { resolvePriceId } = await import("@/lib/stripe");
    const id = await resolvePriceId("starter", "month");
    expect(id).toBeNull();
  });

  it("resolveTierAndInterval reverses a Price's lookup_key", async () => {
    retrieve.mockResolvedValue({ id: "price_x", lookup_key: "growth_annual" });
    const { resolveTierAndInterval } = await import("@/lib/stripe");
    const res = await resolveTierAndInterval("price_x");
    expect(res).toEqual({ tier: "growth", interval: "year" });
  });

  it("resolveTierAndInterval returns null for a Price with no recognized lookup_key", async () => {
    retrieve.mockResolvedValue({ id: "price_y", lookup_key: null });
    const { resolveTierAndInterval } = await import("@/lib/stripe");
    const res = await resolveTierAndInterval("price_y");
    expect(res).toBeNull();
  });
});
