/**
 * W12-C Codex retest hotfix — header-compat regression coverage.
 *
 * The original requireCronSecret read only `Authorization: Bearer`,
 * but the internal /api/reminders chain has always sent
 * `x-cron-secret` (two divergent cron-auth shapes in the same
 * codebase). Codex's retest used the documented header from the
 * prompt and got a 401 — a real footgun for anyone testing.
 *
 * This file pins:
 *   - Authorization: Bearer still works (no regression for Vercel)
 *   - x-cron-secret works (the new path)
 *   - Wrong secret on either header → 401
 *   - No secret at all → 401
 *   - CRON_SECRET env unset → 503 (fail-closed semantics intact)
 *   - CODEX_CRON_SECRET still accepted as a parallel secret
 *
 * If a future refactor strips x-cron-secret support, the manual-
 * curl footgun comes right back. These tests are the wall.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireCronSecret } from "@/lib/server/authz";

const PRIMARY_SECRET = "test-primary-secret-abc123";
const CODEX_SECRET = "test-codex-secret-xyz789";

// Snapshot env vars so tests don't leak into each other.
let savedPrimary: string | undefined;
let savedCodex: string | undefined;

beforeEach(() => {
  savedPrimary = process.env.CRON_SECRET;
  savedCodex = process.env.CODEX_CRON_SECRET;
  process.env.CRON_SECRET = PRIMARY_SECRET;
  delete process.env.CODEX_CRON_SECRET;
});

afterEach(() => {
  if (savedPrimary === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedPrimary;
  if (savedCodex === undefined) delete process.env.CODEX_CRON_SECRET;
  else process.env.CODEX_CRON_SECRET = savedCodex;
});

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://test/api/cron/anything", {
    method: "GET",
    headers,
  });
}

describe("requireCronSecret — header compat (W12-C hotfix)", () => {
  it("accepts Authorization: Bearer with the primary secret", () => {
    expect(
      requireCronSecret(req({ Authorization: `Bearer ${PRIMARY_SECRET}` })),
    ).toBeNull();
  });

  it("accepts x-cron-secret with the primary secret (THE hotfix)", () => {
    // This is THE regression. Pre-hotfix this returned 401 with
    // { error: "Unauthorized" }. The internal reminders chain has
    // always sent x-cron-secret; now any /api/cron/* route does too.
    expect(
      requireCronSecret(req({ "x-cron-secret": PRIMARY_SECRET })),
    ).toBeNull();
  });

  it("rejects when neither header is present", () => {
    const res = requireCronSecret(req());
    expect(res?.status).toBe(401);
  });

  it("rejects a wrong secret on Authorization: Bearer", () => {
    const res = requireCronSecret(req({ Authorization: "Bearer wrong" }));
    expect(res?.status).toBe(401);
  });

  it("rejects a wrong secret on x-cron-secret", () => {
    const res = requireCronSecret(req({ "x-cron-secret": "wrong" }));
    expect(res?.status).toBe(401);
  });

  it("503s when CRON_SECRET env var is unset (fail-closed semantics)", () => {
    delete process.env.CRON_SECRET;
    const res = requireCronSecret(
      req({ Authorization: `Bearer ${PRIMARY_SECRET}` }),
    );
    expect(res?.status).toBe(503);
  });

  it("accepts CODEX_CRON_SECRET via Authorization Bearer when configured", () => {
    process.env.CODEX_CRON_SECRET = CODEX_SECRET;
    expect(
      requireCronSecret(req({ Authorization: `Bearer ${CODEX_SECRET}` })),
    ).toBeNull();
  });

  it("accepts CODEX_CRON_SECRET via x-cron-secret when configured", () => {
    process.env.CODEX_CRON_SECRET = CODEX_SECRET;
    expect(
      requireCronSecret(req({ "x-cron-secret": CODEX_SECRET })),
    ).toBeNull();
  });

  it("Authorization wins when both headers are present (matches Vercel traffic)", () => {
    // If Vercel sends Authorization: Bearer with the right secret
    // AND a stale x-cron-secret with the wrong one is somehow set,
    // the right one wins. This is the documented precedence.
    expect(
      requireCronSecret(
        req({
          Authorization: `Bearer ${PRIMARY_SECRET}`,
          "x-cron-secret": "stale-wrong",
        }),
      ),
    ).toBeNull();
  });

});
