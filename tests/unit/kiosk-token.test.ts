import { describe, it, expect } from "vitest";
import {
  generateActivationCode,
  generateStationId,
  generateTokenIdAndSecret,
  hashSecret,
} from "@/lib/server/kiosk";

describe("generateActivationCode", () => {
  it("returns 8 uppercase hex characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateActivationCode();
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it("returns different codes on each call (entropy check)", () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateActivationCode());
    }
    // 8 hex chars = 4.3B keyspace; 100 random samples should all be unique
    expect(codes.size).toBe(100);
  });
});

describe("generateStationId", () => {
  it("returns kt_-prefixed... wait, station IDs are stn_-prefixed", () => {
    for (let i = 0; i < 10; i++) {
      const id = generateStationId();
      expect(id).toMatch(/^stn_[0-9a-f]{16}$/);
    }
  });

  it("returns unique values", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateStationId());
    expect(ids.size).toBe(100);
  });
});

describe("generateTokenIdAndSecret", () => {
  it("returns kt_-prefixed token ID and base64url secret", () => {
    const { tokenId, secret } = generateTokenIdAndSecret();
    expect(tokenId).toMatch(/^kt_[0-9a-f]{12}$/);
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(40);
  });

  it("token IDs and secrets are independently random", () => {
    const tokens = new Set();
    const secrets = new Set();
    for (let i = 0; i < 50; i++) {
      const { tokenId, secret } = generateTokenIdAndSecret();
      tokens.add(tokenId);
      secrets.add(secret);
    }
    expect(tokens.size).toBe(50);
    expect(secrets.size).toBe(50);
  });
});

describe("hashSecret", () => {
  it("returns SHA-256 hex (64 chars)", () => {
    const h = hashSecret("hello world");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashSecret("test")).toBe(hashSecret("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashSecret("a")).not.toBe(hashSecret("b"));
  });

  it("matches a known SHA-256 value", () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(hashSecret("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
