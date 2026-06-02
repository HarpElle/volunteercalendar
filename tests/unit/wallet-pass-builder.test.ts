import { describe, it, expect } from "vitest";
import { buildPassProps } from "@/lib/server/wallet-pass/builder";

describe("buildPassProps (W10-5A V2 storeCard layout)", () => {
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

  it("uses storeCard layout (not generic) to unlock strip image", () => {
    const p = buildPassProps(baseInput, "p", "T");
    // storeCard is the type that supports stripImage. If this regresses
    // back to `generic`, the strip image silently won't render.
    expect(p.storeCard).toBeDefined();
    expect((p as unknown as { generic?: unknown }).generic).toBeUndefined();
  });

  it("logoText is the church name (renders next to VolunteerCal logo)", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.logoText).toBe("First Church");
  });

  it("headerFields carries the short household code (top-right)", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.storeCard.headerFields).toEqual([
      { key: "household_code", label: "Code", value: "123456" },
    ]);
  });

  it("primaryField is the family name", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.storeCard.primaryFields).toEqual([
      { key: "family", label: "Family", value: "The Paschall Family" },
    ]);
  });

  it("secondaryFields is a single field listing children as multi-line", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.storeCard.secondaryFields).toEqual([
      {
        key: "children_list",
        label: "Children",
        value: "Alpha  ·  K\nBravo  ·  1st",
      },
    ]);
  });

  it("uses singular 'Child' label when there's exactly one", () => {
    const p = buildPassProps(
      { ...baseInput, children: [{ id: "c1", first_name: "Solo", grade: "K" }] },
      "p",
      "T",
    );
    expect(p.storeCard.secondaryFields[0].label).toBe("Child");
    expect(p.storeCard.secondaryFields[0].value).toBe("Solo  ·  K");
  });

  it("auxiliaryFields is empty (children moved into secondary)", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.storeCard.auxiliaryFields).toEqual([]);
  });

  it("inline secondary list handles a child without a grade", () => {
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
    expect(p.storeCard.secondaryFields[0].value).toBe("Alpha\nBravo  ·  1st");
  });

  it("uses friendly empty-state copy when there are no children (front + back)", () => {
    const p = buildPassProps({ ...baseInput, children: [] }, "p", "T");
    expect(p.storeCard.secondaryFields[0].value).toBe(
      "Add children in your account",
    );
    const fullBack = p.storeCard.backFields.find(
      (f) => f.key === "children_full",
    );
    expect(fullBack?.value).toMatch(/No children on file/);
  });

  it("renders the full child list on the back with bullets + grades", () => {
    const p = buildPassProps(baseInput, "p", "T");
    const full = p.storeCard.backFields.find((f) => f.key === "children_full");
    expect(full?.value).toBe("• Alpha — K\n• Bravo — 1st");
  });

  it("back of pass carries 'Powered by VolunteerCal'", () => {
    const p = buildPassProps(baseInput, "p", "T");
    const powered = p.storeCard.backFields.find((f) => f.key === "powered_by");
    expect(powered?.value).toBe("Powered by VolunteerCal");
  });

  it("back of pass carries kiosk-scan instructions + support email + household ID", () => {
    const p = buildPassProps(baseInput, "p", "T");
    const keys = p.storeCard.backFields.map((f) => f.key);
    expect(keys).toContain("kiosk_instructions");
    expect(keys).toContain("support");
    expect(keys).toContain("household_id");
  });

  it("QR barcode encodes the household_id with the short code as alt text", () => {
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

  it("uses the documented brand colors verbatim", () => {
    const p = buildPassProps(baseInput, "p", "T");
    expect(p.backgroundColor).toBe("rgb(45, 48, 71)");
    expect(p.foregroundColor).toBe("rgb(254, 252, 249)");
    expect(p.labelColor).toBe("rgb(224, 122, 95)");
  });

  it("preferred name flows through to the secondary list", () => {
    const p = buildPassProps(
      {
        ...baseInput,
        children: [{ id: "c1", first_name: "Sissy", grade: "K" }],
      },
      "p",
      "T",
    );
    expect(p.storeCard.secondaryFields[0].value).toContain("Sissy");
  });

  it("scales to 6 children without truncating the secondary value", () => {
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
    // Full back-list also shows all 6
    const fullBack = p.storeCard.backFields.find(
      (f) => f.key === "children_full",
    );
    expect(fullBack?.value.split("\n")).toHaveLength(6);
  });
});
