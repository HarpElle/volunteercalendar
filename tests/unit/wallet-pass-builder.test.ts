import { describe, it, expect } from "vitest";
import { buildPassProps } from "@/lib/server/wallet-pass/builder";

describe("buildPassProps (W10-5A V3 light/airy layout)", () => {
  const baseInput = {
    household_id: "hh_abcdef123456",
    auth_token: "auth_token_xyz",
    family_name: "The Paschall Family",
    church_name: "First Church",
    children: [
      { id: "c1", first_name: "Alpha", grade: "K" },
      { id: "c2", first_name: "Bravo", grade: "1st" },
    ],
    support_url: "https://volunteercal.com/help",
  };

  describe("identity", () => {
    it("uses the household_id as the serial number (so re-downloads replace)", () => {
      const p = buildPassProps(baseInput, "pass.test.id", "TEAMID");
      expect(p.serialNumber).toBe("hh_abcdef123456");
      expect(p.authenticationToken).toBe("auth_token_xyz");
    });

    it("forwards passTypeIdentifier + teamIdentifier verbatim", () => {
      const p = buildPassProps(baseInput, "pass.test.id", "TEAMID");
      expect(p.passTypeIdentifier).toBe("pass.test.id");
      expect(p.teamIdentifier).toBe("TEAMID");
    });

    it("logoText is the full church name (rendered next to the badge)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.logoText).toBe("First Church");
    });

    it("organizationName is the church name (lock-screen identity)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.organizationName).toBe("First Church");
    });

    it("description mentions both family name and 'check-in pass'", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.description).toBe(
        "The Paschall Family — family check-in pass",
      );
    });
  });

  describe("V3 color palette (light/airy)", () => {
    it("background is cream, foreground indigo, label muted-indigo", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.backgroundColor).toBe("rgb(254, 252, 249)");
      expect(p.foregroundColor).toBe("rgb(45, 48, 71)");
      expect(p.labelColor).toBe("rgb(107, 110, 138)");
    });
  });

  describe("V3 pass type + layout", () => {
    it("uses storeCard (semantically right for 'family loyalty card')", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard).toBeDefined();
      expect((p as unknown as { generic?: unknown }).generic).toBeUndefined();
    });

    it("auxiliaryFields is empty (children consolidated into secondary)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.auxiliaryFields).toEqual([]);
    });
  });

  describe("front-of-pass labels are dropped (V3 cleanup)", () => {
    it("primary field has empty label — 'Family' under family name was noise", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.primaryFields).toEqual([
        { key: "family", label: "", value: "The Paschall Family" },
      ]);
    });

    it("secondary field has empty label — 'CHILDREN' above kids was noise", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.secondaryFields[0].label).toBe("");
    });

    it("header (code) has empty label — short alphanumeric reads as a code", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.headerFields).toEqual([
        { key: "household_code", label: "", value: "123456" },
      ]);
    });
  });

  describe("children list (front)", () => {
    it("renders one child per line: 'Name · Grade'", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.secondaryFields[0].value).toBe(
        "Alpha · K\nBravo · 1st",
      );
    });

    it("handles a child without a grade — just the name, no separator", () => {
      const p = buildPassProps(
        {
          ...baseInput,
          children: [
            { id: "c1", first_name: "Alpha", grade: null },
            { id: "c2", first_name: "Bravo", grade: "1st" },
          ],
        },
        "p",
        "T",
      );
      expect(p.storeCard.secondaryFields[0].value).toBe("Alpha\nBravo · 1st");
    });

    it("uses friendly empty-state copy when there are no children", () => {
      const p = buildPassProps({ ...baseInput, children: [] }, "p", "T");
      expect(p.storeCard.secondaryFields[0].value).toBe(
        "Add children in your account",
      );
    });

    it("scales to 6 children — all visible on front, no truncation in props", () => {
      const lots = {
        ...baseInput,
        children: [
          { id: "c1", first_name: "A", grade: "K" },
          { id: "c2", first_name: "B", grade: "1" },
          { id: "c3", first_name: "C", grade: "2" },
          { id: "c4", first_name: "D", grade: "3" },
          { id: "c5", first_name: "E", grade: "4" },
          { id: "c6", first_name: "F", grade: "5" },
        ],
      };
      const p = buildPassProps(lots, "p", "T");
      const lines = p.storeCard.secondaryFields[0].value.split("\n");
      expect(lines).toHaveLength(6);
    });
  });

  describe("back-of-pass content", () => {
    it("renders the full child list with bullets + em-dash grades", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const full = p.storeCard.backFields.find(
        (f) => f.key === "children_full",
      );
      expect(full?.value).toBe("• Alpha — K\n• Bravo — 1st");
    });

    it("carries 'Powered by VolunteerCal' attribution", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const powered = p.storeCard.backFields.find(
        (f) => f.key === "powered_by",
      );
      expect(powered?.value).toBe("Powered by VolunteerCal");
    });

    it("carries kiosk-scan instructions + support email", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const keys = p.storeCard.backFields.map((f) => f.key);
      expect(keys).toContain("kiosk_instructions");
      expect(keys).toContain("support");
    });

    it("V3 cleanup: Household ID is NOT on the back (parents don't need it)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const keys = p.storeCard.backFields.map((f) => f.key);
      expect(keys).not.toContain("household_id");
    });

    it("V3 cleanup: no children_overflow back-field (front shows all)", () => {
      const lots = {
        ...baseInput,
        children: Array.from({ length: 6 }, (_, i) => ({
          id: `c${i}`,
          first_name: `Kid${i}`,
          grade: `${i + 1}`,
        })),
      };
      const p = buildPassProps(lots, "p", "T");
      const keys = p.storeCard.backFields.map((f) => f.key);
      expect(keys).not.toContain("children_overflow");
    });
  });

  describe("QR barcode", () => {
    it("encodes the household_id with the short code as alt text", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.barcodes).toEqual([
        {
          format: "PKBarcodeFormatQR",
          message: "hh_abcdef123456",
          messageEncoding: "iso-8859-1",
          altText: "123456",
        },
      ]);
    });
  });

  describe("misc", () => {
    it("sets sharingProhibited to true (passes are per-household)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.sharingProhibited).toBe(true);
    });

    it("preferred name flows through to the front (display already resolved upstream)", () => {
      const p = buildPassProps(
        {
          ...baseInput,
          children: [{ id: "c1", first_name: "Sissy", grade: "K" }],
        },
        "p",
        "T",
      );
      expect(p.storeCard.secondaryFields[0].value).toBe("Sissy · K");
    });
  });
});
