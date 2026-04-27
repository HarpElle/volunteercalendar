import { describe, it, expect } from "vitest";
import { escapeHtml, escapeShort } from "@/lib/utils/emails/escape";

describe("escapeHtml", () => {
  it("escapes the standard XSS-relevant chars", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;&#47;script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("AT&T")).toBe("AT&amp;T");
  });

  it("escapes quotes", () => {
    expect(escapeHtml(`onclick="bad()"`)).toBe(
      "onclick&#61;&quot;bad()&quot;",
    );
  });

  it("escapes single quotes and backticks", () => {
    expect(escapeHtml("can't")).toBe("can&#39;t");
    expect(escapeHtml("`quasi`")).toBe("&#96;quasi&#96;");
  });

  it("returns empty string for null and undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("coerces non-strings to string", () => {
    expect(escapeHtml(123)).toBe("123");
    expect(escapeHtml(true)).toBe("true");
  });

  it("preserves regular text", () => {
    expect(escapeHtml("Sunday Service Reminders")).toBe(
      "Sunday Service Reminders",
    );
  });
});

describe("escapeShort", () => {
  it("escapes and applies a length cap", () => {
    const longInput = "<bad>".repeat(100);
    const r = escapeShort(longInput, 50);
    expect(r.length).toBeLessThanOrEqual(60); // some headroom for escape expansion
    expect(r.endsWith("…")).toBe(true);
  });

  it("does not truncate short input", () => {
    expect(escapeShort("Worship Team", 200)).toBe("Worship Team");
  });

  it("uses default cap of 200", () => {
    const r = escapeShort("a".repeat(300));
    expect(r.length).toBeLessThanOrEqual(201);
  });
});
