import { describe, it, expect, beforeEach } from "vitest";
import {
  signFamilyPassUrl,
  verifyFamilyPassUrl,
} from "@/lib/server/wallet-pass/sign-url";

const SECRET = "test-secret-32-bytes-long-enough-for-hmac-test-padding-padding";

describe("wallet-pass sign-url", () => {
  beforeEach(() => {
    process.env.WALLET_PASS_SIGNING_SECRET = SECRET;
  });

  describe("signFamilyPassUrl", () => {
    it("returns a URL with all four required params", () => {
      const signed = signFamilyPassUrl(
        "https://example.com",
        "church_a",
        "household_b",
        Date.now(),
      );
      const url = new URL(signed.url);
      expect(url.searchParams.get("c")).toBe("church_a");
      expect(url.searchParams.get("h")).toBe("household_b");
      expect(url.searchParams.get("exp")).toMatch(/^\d+$/);
      expect(url.searchParams.get("sig")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("expires_at is in ISO format ~10 minutes in the future", () => {
      const now = Date.now();
      const signed = signFamilyPassUrl(
        "https://example.com",
        "church_a",
        "household_b",
        now,
      );
      const expiresMs = new Date(signed.expires_at).getTime();
      expect(expiresMs - now).toBeGreaterThanOrEqual(9 * 60_000);
      expect(expiresMs - now).toBeLessThanOrEqual(11 * 60_000);
    });
  });

  describe("verifyFamilyPassUrl", () => {
    it("returns the church + household for a valid signature", () => {
      const now = Date.now();
      const signed = signFamilyPassUrl(
        "https://example.com",
        "church_a",
        "household_b",
        now,
      );
      const params = new URL(signed.url).searchParams;
      const verified = verifyFamilyPassUrl(params, now);
      expect(verified).toEqual({
        church_id: "church_a",
        household_id: "household_b",
      });
    });

    it("returns null when sig is missing", () => {
      const params = new URLSearchParams({
        c: "church_a",
        h: "household_b",
        exp: String(Math.floor(Date.now() / 1000) + 600),
      });
      expect(verifyFamilyPassUrl(params, Date.now())).toBeNull();
    });

    it("returns null when sig is tampered", () => {
      const now = Date.now();
      const signed = signFamilyPassUrl(
        "https://example.com",
        "church_a",
        "household_b",
        now,
      );
      const params = new URL(signed.url).searchParams;
      params.set("sig", "f".repeat(64)); // wrong sig, same length
      expect(verifyFamilyPassUrl(params, now)).toBeNull();
    });

    it("returns null when household_id is tampered (so sig no longer matches)", () => {
      const now = Date.now();
      const signed = signFamilyPassUrl(
        "https://example.com",
        "church_a",
        "household_b",
        now,
      );
      const params = new URL(signed.url).searchParams;
      params.set("h", "household_evil");
      expect(verifyFamilyPassUrl(params, now)).toBeNull();
    });

    it("returns null after expiration", () => {
      const issuedAt = Date.now() - 11 * 60_000; // 11 min ago
      const signed = signFamilyPassUrl(
        "https://example.com",
        "church_a",
        "household_b",
        issuedAt,
      );
      const params = new URL(signed.url).searchParams;
      expect(verifyFamilyPassUrl(params, Date.now())).toBeNull();
    });

    it("returns null when sig is the wrong length", () => {
      const params = new URLSearchParams({
        c: "church_a",
        h: "household_b",
        exp: String(Math.floor(Date.now() / 1000) + 600),
        sig: "abc123", // too short
      });
      expect(verifyFamilyPassUrl(params, Date.now())).toBeNull();
    });
  });
});
