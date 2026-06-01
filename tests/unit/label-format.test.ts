import { describe, it, expect } from "vitest";
import { formatLabelName } from "@/lib/server/label-format";

describe("formatLabelName", () => {
  describe("default (first_name_last_initial)", () => {
    it("formats 'Sarah' 'Johnson' as 'Sarah J.'", () => {
      expect(formatLabelName("Sarah", "Johnson")).toBe("Sarah J.");
    });

    it("uppercases a lowercase initial", () => {
      expect(formatLabelName("sarah", "johnson")).toBe("sarah J.");
    });

    it("trims whitespace", () => {
      expect(formatLabelName("  Sarah  ", "  Johnson  ")).toBe("Sarah J.");
    });

    it("falls back to just first name when last is empty", () => {
      expect(formatLabelName("Sarah", "")).toBe("Sarah");
    });

    it("falls back to just last when first is empty", () => {
      expect(formatLabelName("", "Johnson")).toBe("Johnson");
    });

    it("skips the period for non-alphabetic initials", () => {
      expect(formatLabelName("Sarah", "-Hyphen")).toBe("Sarah");
      expect(formatLabelName("Sarah", "'Apostrophe")).toBe("Sarah");
    });

    it("activates explicitly when format is undefined", () => {
      expect(formatLabelName("Sarah", "Johnson", undefined)).toBe("Sarah J.");
    });

    it("activates when format is an unknown string", () => {
      expect(formatLabelName("Sarah", "Johnson", "garbage")).toBe("Sarah J.");
    });

    it("activates when format is null", () => {
      expect(formatLabelName("Sarah", "Johnson", null)).toBe("Sarah J.");
    });
  });

  describe("first_name only", () => {
    it("returns just the first name", () => {
      expect(formatLabelName("Sarah", "Johnson", "first_name")).toBe("Sarah");
    });

    it("falls back to last name when first is empty", () => {
      expect(formatLabelName("", "Johnson", "first_name")).toBe("Johnson");
    });
  });

  describe("first_and_last (legacy full-name)", () => {
    it("returns 'Sarah Johnson'", () => {
      expect(formatLabelName("Sarah", "Johnson", "first_and_last")).toBe(
        "Sarah Johnson",
      );
    });

    it("handles missing last gracefully", () => {
      expect(formatLabelName("Sarah", "", "first_and_last")).toBe("Sarah");
    });
  });

  describe("preferred name as input", () => {
    it("formats a preferred name + last name", () => {
      // The route passes the resolved displayName (preferred ?? first)
      // as the first arg, so the helper sees "Sissy" not "Sarah" here.
      expect(formatLabelName("Sissy", "Johnson")).toBe("Sissy J.");
    });
  });
});
