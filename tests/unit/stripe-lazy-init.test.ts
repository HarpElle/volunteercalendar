/**
 * Codex Run 2 follow-up: Stripe SDK must lazy-load.
 *
 * Vercel preview builds were failing because the previous src/lib/stripe.ts
 * eagerly constructed `new Stripe("", ...)` at module-load. The Stripe
 * constructor throws synchronously on empty key, crashing the build during
 * page-data collection for /api/account/delete (which imports stripe).
 *
 * The fix wraps the SDK in a Proxy that defers construction until first
 * property access. These tests pin that behavior so future refactors can't
 * silently re-introduce the eager-init crash.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("stripe lazy init", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    // Reset the module cache so we re-import a fresh instance per test.
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalKey;
    }
  });

  it("module imports without throwing when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    // The build-crashing regression: this used to throw during the import.
    await expect(import("@/lib/stripe")).resolves.toBeDefined();
  });

  it("accessing stripe properties throws a clear error when key is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { stripe } = await import("@/lib/stripe");
    // The proxy traps the access and triggers lazy construction, which
    // throws because no key is set. Error message must be actionable.
    expect(() => stripe.checkout).toThrow(/STRIPE_SECRET_KEY is not set/);
  });

  it("PRICE_TO_TIER and TIER_TO_PRICE module-level exports work without key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { PRICE_TO_TIER, TIER_TO_PRICE } = await import("@/lib/stripe");
    // These are pure env-var lookups; they should never need Stripe SDK.
    expect(typeof PRICE_TO_TIER).toBe("object");
    expect(typeof TIER_TO_PRICE).toBe("object");
  });

  it("accessing stripe properties succeeds when key is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_test";
    const { stripe } = await import("@/lib/stripe");
    // Just verify no throw — we're not making real Stripe calls.
    // `stripe.checkout` should be a non-null object.
    expect(stripe.checkout).toBeDefined();
  });
});
