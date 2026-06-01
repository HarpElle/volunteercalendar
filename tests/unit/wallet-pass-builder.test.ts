import { describe, it, expect } from "vitest";
import { buildPassProps } from "@/lib/server/wallet-pass/builder";

describe("buildPassProps", () => {
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

  it("primary field is the family name", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.generic.primaryFields).toEqual([
      { key: "family", label: "Family", value: "The Paschall Family" },
    ]);
  });

  it("secondary fields include children count + short household code", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.generic.secondaryFields).toEqual([
      { key: "children_count", label: "Children", value: "2" },
      { key: "household_code", label: "Code", value: "123456" },
    ]);
  });

  it("auxiliary fields cap at 4 children", () => {
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
    expect(p.generic.auxiliaryFields).toHaveLength(4);
    expect(p.generic.auxiliaryFields.map((f) => f.value)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    const overflow = p.generic.backFields.find(
      (f) => f.key === "children_overflow",
    );
    expect(overflow?.value).toBe("(+2 more on the front)");
  });

  it("omits the overflow back-field when nothing's hidden", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(
      p.generic.backFields.find((f) => f.key === "children_overflow"),
    ).toBeUndefined();
  });

  it("renders the full child list on the back with bullets + grades", () => {
    const p = buildPassProps(baseInput, "p", "T");
    const full = p.generic.backFields.find((f) => f.key === "children_full");
    expect(full?.value).toBe("• Alpha — K\n• Bravo — 1st");
  });

  it("handles missing grade gracefully on the back-field list", () => {
    const input = {
      ...baseInput,
      children: [
        { id: "c1", first_name: "Alpha", grade: null },
        { id: "c2", first_name: "Bravo", grade: "1st" },
      ],
    };
    const p = buildPassProps(input, "p", "T");
    const full = p.generic.backFields.find((f) => f.key === "children_full");
    expect(full?.value).toBe("• Alpha\n• Bravo — 1st");
  });

  it("uses friendly empty-state copy when there are no children", () => {
    const p = buildPassProps(
      { ...baseInput, children: [] },
      "p",
      "T",
    );
    const full = p.generic.backFields.find((f) => f.key === "children_full");
    expect(full?.value).toMatch(/No children on file/);
    expect(p.generic.secondaryFields[0].value).toBe("0");
  });

  it("QR barcode encodes the household_id", () => {
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

  it("sets sharingProhibited to true (passes are per-household)", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.sharingProhibited).toBe(true);
  });

  it("organizationName is the church name (shows on pass front)", () => {
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
