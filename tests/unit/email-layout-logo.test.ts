/**
 * Wave 11 Sub-PR C — pins the wrapInLayout logo branching.
 *
 * The layout grew an optional `churchLogoUrl` field. When present,
 * the indigo header banner gains a 64x64 logo block above the
 * heading. When absent/null, behavior is identical to pre-W11-C
 * (text-only header).
 *
 * These tests pin:
 *   - Default behavior unchanged: no img tag when no logo passed
 *   - URL → img tag with src + alt (alt falls back to churchName from headerSubtitle)
 *   - HTML-escaping on the alt text (prevents header-subtitle XSS via stored data)
 *   - Null and empty-string logo URLs both fall back to text-only
 *   - Heading + subtitle text still render around the logo block
 */

import { describe, it, expect } from "vitest";
import { wrapInLayout } from "@/lib/utils/emails/base-layout";

describe("wrapInLayout — W11-C logo branching", () => {
  it("renders no <img> tag when churchLogoUrl is undefined (default)", () => {
    const html = wrapInLayout({
      headerText: "Test heading",
      headerSubtitle: "Test Church",
      body: "<p>hi</p>",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("Test heading");
    expect(html).toContain("Test Church");
  });

  it("renders no <img> tag when churchLogoUrl is null", () => {
    const html = wrapInLayout({
      headerText: "Test heading",
      headerSubtitle: "Test Church",
      body: "<p>hi</p>",
      churchLogoUrl: null,
    });
    expect(html).not.toContain("<img");
  });

  it("renders no <img> tag when churchLogoUrl is empty string", () => {
    // Falsy guard — empty string is the kind of thing Firestore
    // sometimes returns when a field was cleared and not deleted.
    const html = wrapInLayout({
      headerText: "Test heading",
      headerSubtitle: "Test Church",
      body: "<p>hi</p>",
      churchLogoUrl: "",
    });
    expect(html).not.toContain("<img");
  });

  it("renders an <img> tag when churchLogoUrl is a real URL", () => {
    const html = wrapInLayout({
      headerText: "Test heading",
      headerSubtitle: "Test Church",
      body: "<p>hi</p>",
      churchLogoUrl: "https://storage.example.com/c/logo.png",
    });
    expect(html).toContain('<img src="https://storage.example.com/c/logo.png"');
    expect(html).toContain('alt="Test Church"'); // alt from subtitle
    expect(html).toContain('width="64"');
    expect(html).toContain('height="64"');
  });

  it("escapes HTML in the alt text (church name from user-controlled data)", () => {
    // Header subtitle is caller-supplied and routes pass churchName
    // straight through. If churchName ever contains <script>, the
    // img alt must not interpolate it raw.
    const html = wrapInLayout({
      headerText: "Test",
      headerSubtitle: '<script>alert("xss")</script>',
      body: "<p>hi</p>",
      churchLogoUrl: "https://example.com/logo.png",
    });
    expect(html).not.toContain('<script>alert');
    // Should appear escaped in the alt attribute
    expect(html).toContain('&lt;script&gt;');
  });

  it('alt falls back to "Church logo" when no headerSubtitle', () => {
    const html = wrapInLayout({
      headerText: "Test heading",
      body: "<p>hi</p>",
      churchLogoUrl: "https://example.com/logo.png",
    });
    expect(html).toContain('alt="Church logo"');
  });

  it("keeps the heading + subtitle text rendering around the logo block", () => {
    // Logo is ADDITIVE — it doesn't replace the existing header text.
    const html = wrapInLayout({
      headerText: "Sub needed today",
      headerSubtitle: "Anchor Falls Church",
      body: "<p>body</p>",
      churchLogoUrl: "https://example.com/logo.png",
    });
    expect(html).toContain("Sub needed today");
    expect(html).toContain("Anchor Falls Church");
    expect(html).toContain("<img");
  });
});
