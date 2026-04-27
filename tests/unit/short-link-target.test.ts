import { describe, it, expect } from "vitest";
import { validateTargetUrl } from "@/lib/utils/short-link-target";

describe("validateTargetUrl", () => {
  describe("valid inputs", () => {
    it("accepts simple relative paths", () => {
      const r = validateTargetUrl("/dashboard/welcome");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.kind).toBe("relative");
    });

    it("accepts relative paths with query strings", () => {
      const r = validateTargetUrl("/events/abc?ref=email");
      expect(r.ok).toBe(true);
    });

    it("accepts our own domains", () => {
      for (const url of [
        "https://volunteercal.com/dashboard",
        "https://www.volunteercal.com/login",
        "https://harpelle.com",
      ]) {
        const r = validateTargetUrl(url);
        expect(r.ok, `expected ${url} to pass`).toBe(true);
        if (r.ok) expect(r.kind).toBe("volunteercal");
      }
    });

    it("accepts allowlisted external hosts", () => {
      for (const url of [
        "https://docs.google.com/forms/abc",
        "https://forms.gle/xyz",
        "https://youtu.be/abc123",
        "https://subsplash.com/whatever",
        "https://www.eventbrite.com/event/123",
      ]) {
        const r = validateTargetUrl(url);
        expect(r.ok, `expected ${url} to pass`).toBe(true);
        if (r.ok) expect(r.kind).toBe("allowlist");
      }
    });

    it("trims leading and trailing whitespace", () => {
      const r = validateTargetUrl("   /dashboard   ");
      expect(r.ok).toBe(true);
    });
  });

  describe("rejections (security-critical)", () => {
    it("rejects empty string", () => {
      const r = validateTargetUrl("");
      expect(r.ok).toBe(false);
    });

    it("rejects whitespace-only", () => {
      const r = validateTargetUrl("   \n\t   ");
      expect(r.ok).toBe(false);
    });

    it("rejects URLs longer than 2048 chars", () => {
      const r = validateTargetUrl("/" + "a".repeat(3000));
      expect(r.ok).toBe(false);
    });

    it("rejects javascript: pseudo-URLs", () => {
      const r = validateTargetUrl("javascript:alert(1)");
      expect(r.ok).toBe(false);
    });

    it("rejects data: URIs", () => {
      const r = validateTargetUrl("data:text/html,<script>alert(1)</script>");
      expect(r.ok).toBe(false);
    });

    it("rejects protocol-relative URLs (//evil.com)", () => {
      const r = validateTargetUrl("//evil.com/path");
      expect(r.ok).toBe(false);
    });

    it("rejects ftp:// and other non-http protocols", () => {
      const r = validateTargetUrl("ftp://malicious.example.com");
      expect(r.ok).toBe(false);
    });

    it("rejects arbitrary external domains not on the allowlist", () => {
      for (const url of [
        "https://evil.example.com",
        "https://random-phishing-site.tk",
        "https://docs.google.com.evil.com",
        "https://docs.google.com@evil.com",
      ]) {
        const r = validateTargetUrl(url);
        expect(r.ok, `expected ${url} to fail`).toBe(false);
      }
    });

    it("rejects malformed URLs", () => {
      const r = validateTargetUrl("not a url at all");
      expect(r.ok).toBe(false);
    });

    it("rejects URLs with unusual hosts that look like trusted ones", () => {
      // Common attack: https://docs.google.com.evil.com — looks like Google
      // but the actual host is evil.com.
      for (const url of [
        "https://docs.google.com.evil.com",
        "https://youtube.com.attacker.io",
        "https://forms.gle.malicious.net",
      ]) {
        const r = validateTargetUrl(url);
        expect(r.ok, `expected ${url} to fail`).toBe(false);
      }
    });
  });

  describe("edge cases", () => {
    it("treats relative paths starting with // as protocol-relative (rejected)", () => {
      const r = validateTargetUrl("//valid-looking/path");
      expect(r.ok).toBe(false);
    });

    it("preserves the URL form for absolute matches", () => {
      const r = validateTargetUrl("https://docs.google.com/forms/abc");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toContain("docs.google.com");
    });
  });
});
