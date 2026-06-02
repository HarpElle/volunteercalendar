import { describe, it, expect } from "vitest";
import { buildPassProps } from "@/lib/server/wallet-pass/builder";

describe("buildPassProps (W10-5A V4 redesign)", () => {
  const baseInput = {
    household_id: "hh_abcdef123456",
    auth_token: "auth_token_xyz",
    family_name: "The Paschall Family",
    church_name: "Anchor Falls Church",
    children: [
      { id: "c1", first_name: "Ellianna", grade: "4th" },
      { id: "c2", first_name: "Harper", grade: "6th" },
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

    it("logoText is the full church name", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.logoText).toBe("Anchor Falls Church");
    });

    it("organizationName is the church name (lock-screen identity)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.organizationName).toBe("Anchor Falls Church");
    });

    it("description is '<Family> Check-In' (no The, no em dash, no AI-ish phrasing)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.description).toBe("Paschall Family Check-In");
    });
  });

  describe('V4 strips leading "The " from family_name', () => {
    it("'The Paschall Family' → 'Paschall Family' on primary + description", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.primaryFields[0].value).toBe("Paschall Family");
      expect(p.description).toBe("Paschall Family Check-In");
    });

    it("case-insensitive: 'the Smith Family' → 'Smith Family'", () => {
      const p = buildPassProps(
        { ...baseInput, family_name: "the Smith Family" },
        "p",
        "T",
      );
      expect(p.storeCard.primaryFields[0].value).toBe("Smith Family");
    });

    it("leaves other family names alone: 'Mendoza Family' → 'Mendoza Family'", () => {
      const p = buildPassProps(
        { ...baseInput, family_name: "Mendoza Family" },
        "p",
        "T",
      );
      expect(p.storeCard.primaryFields[0].value).toBe("Mendoza Family");
    });
  });

  describe("V4 color palette (cream + indigo + coral labels)", () => {
    it("background cream, foreground indigo, label coral", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.backgroundColor).toBe("rgb(254, 252, 249)");
      expect(p.foregroundColor).toBe("rgb(45, 48, 71)");
      expect(p.labelColor).toBe("rgb(224, 122, 95)");
    });
  });

  describe("V4 pass type + structure", () => {
    it("uses storeCard (semantically right, supports stripImage)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard).toBeDefined();
      expect((p as unknown as { generic?: unknown }).generic).toBeUndefined();
    });

    it("auxiliaryFields is empty in V4 (kids live in secondary)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.auxiliaryFields).toEqual([]);
    });
  });

  describe("front-of-pass labels (V4 brings back semantic labels)", () => {
    it("primary field labeled FAMILY (uppercase, brand-coral)", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.primaryFields).toEqual([
        { key: "family", label: "FAMILY", value: "Paschall Family" },
      ]);
    });

    it("header field labeled CODE", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.headerFields).toEqual([
        { key: "household_code", label: "CODE", value: "123456" },
      ]);
    });
  });

  describe("children — one field per child (V4 fix for V3 single-line truncation)", () => {
    it("renders each child as a separate secondary field with grade as uppercase label", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.storeCard.secondaryFields).toEqual([
        { key: "child_0", label: "4TH", value: "Ellianna" },
        { key: "child_1", label: "6TH", value: "Harper" },
      ]);
    });

    it("handles a child without a grade — empty label, name still renders", () => {
      const p = buildPassProps(
        {
          ...baseInput,
          children: [
            { id: "c1", first_name: "Ellianna", grade: null },
            { id: "c2", first_name: "Harper", grade: "6th" },
          ],
        },
        "p",
        "T",
      );
      expect(p.storeCard.secondaryFields[0]).toEqual({
        key: "child_0",
        label: "",
        value: "Ellianna",
      });
    });

    it("shows up to 3 children + '+N more' overflow slot for 4+", () => {
      const lots = {
        ...baseInput,
        children: [
          { id: "c1", first_name: "A", grade: "K" },
          { id: "c2", first_name: "B", grade: "1" },
          { id: "c3", first_name: "C", grade: "2" },
          { id: "c4", first_name: "D", grade: "3" },
          { id: "c5", first_name: "E", grade: "4" },
        ],
      };
      const p = buildPassProps(lots, "p", "T");
      expect(p.storeCard.secondaryFields).toEqual([
        { key: "child_0", label: "K", value: "A" },
        { key: "child_1", label: "1", value: "B" },
        { key: "child_2", label: "2", value: "C" },
        { key: "child_more", label: "ALSO", value: "+2 more" },
      ]);
    });

    it("uses friendly empty-state placeholder when there are no children", () => {
      const p = buildPassProps({ ...baseInput, children: [] }, "p", "T");
      expect(p.storeCard.secondaryFields).toEqual([
        {
          key: "children_empty",
          label: "CHILDREN",
          value: "Add in your account",
        },
      ]);
    });
  });

  describe("back-of-pass copy (V4 short, human, no em dashes)", () => {
    it("children list uses normal hyphens, not em dashes", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const full = p.storeCard.backFields.find(
        (f) => f.key === "children_full",
      );
      expect(full?.value).toBe("Ellianna - 4th\nHarper - 6th");
      // Hard-assert: no em dashes anywhere in the back copy
      const allBackText = p.storeCard.backFields
        .map((f) => `${f.label} ${f.value}`)
        .join(" ");
      expect(allBackText).not.toMatch(/—/);
    });

    it("how-to-use is one short sentence", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const howTo = p.storeCard.backFields.find(
        (f) => f.key === "how_to_use",
      );
      expect(howTo?.value).toBe(
        "Scan this pass at the check-in kiosk to find your household.",
      );
    });

    it("help line points at the volunteer in person + the help URL", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const help = p.storeCard.backFields.find((f) => f.key === "help");
      expect(help?.value).toContain("check-in volunteer");
      expect(help?.value).toContain("volunteercal.com/help");
    });

    it("carries 'Powered by VolunteerCal' attribution", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const powered = p.storeCard.backFields.find(
        (f) => f.key === "powered_by",
      );
      expect(powered?.value).toBe("Powered by VolunteerCal");
    });

    it("V4 cleanup: no Household ID, no kiosk_instructions key, no support key", () => {
      const p = buildPassProps(baseInput, "p", "T");
      const keys = p.storeCard.backFields.map((f) => f.key);
      expect(keys).not.toContain("household_id");
      expect(keys).not.toContain("kiosk_instructions");
      expect(keys).not.toContain("support");
    });
  });

  describe("locations + relevant_date (V4 forward-compat)", () => {
    it("omits locations when none provided", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect((p as unknown as { locations?: unknown }).locations).toBeUndefined();
    });

    it("passes through locations when provided", () => {
      const p = buildPassProps(
        {
          ...baseInput,
          locations: [
            {
              latitude: 43.0731,
              longitude: -89.4012,
              relevant_text: "Anchor Falls Church campus",
            },
          ],
        },
        "p",
        "T",
      );
      expect((p as unknown as { locations: unknown[] }).locations).toEqual([
        {
          latitude: 43.0731,
          longitude: -89.4012,
          relevantText: "Anchor Falls Church campus",
        },
      ]);
    });

    it("omits relevantDate when relevant_date not provided", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(
        (p as unknown as { relevantDate?: unknown }).relevantDate,
      ).toBeUndefined();
    });

    it("passes through relevant_date when provided", () => {
      const p = buildPassProps(
        { ...baseInput, relevant_date: "2026-06-07T15:00:00Z" },
        "p",
        "T",
      );
      expect(
        (p as unknown as { relevantDate: string }).relevantDate,
      ).toBe("2026-06-07T15:00:00Z");
    });
  });

  describe("QR barcode (unchanged from V3)", () => {
    it("encodes the household_id; altText is the short code", () => {
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
    it("sharingProhibited stays true", () => {
      const p = buildPassProps(baseInput, "p", "T");
      expect(p.sharingProhibited).toBe(true);
    });

    it("preferred name flows through to the child slot", () => {
      const p = buildPassProps(
        {
          ...baseInput,
          children: [{ id: "c1", first_name: "Sissy", grade: "K" }],
        },
        "p",
        "T",
      );
      expect(p.storeCard.secondaryFields[0]).toEqual({
        key: "child_0",
        label: "K",
        value: "Sissy",
      });
    });
  });
});
