import { describe, expect, it } from "vitest";
import {
  extractSurname,
  formatHouseholdDisplay,
  parseName,
} from "@/lib/utils/name";

describe("formatHouseholdDisplay", () => {
  it("returns generic fallback when both names are empty", () => {
    expect(formatHouseholdDisplay({})).toBe("Household");
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "",
        secondary_guardian_name: "",
      }),
    ).toBe("Household");
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: null,
        secondary_guardian_name: null,
      }),
    ).toBe("Household");
  });

  it("formats a single guardian as Last, First", () => {
    expect(
      formatHouseholdDisplay({ primary_guardian_name: "John Doe" }),
    ).toBe("Doe, John");
    expect(
      formatHouseholdDisplay({ primary_guardian_name: "Helen Pevensie" }),
    ).toBe("Pevensie, Helen");
  });

  it("returns just the first name when single-token", () => {
    expect(
      formatHouseholdDisplay({ primary_guardian_name: "Prince" }),
    ).toBe("Prince");
  });

  it("falls back to secondary when primary is empty", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "",
        secondary_guardian_name: "Jane Smith",
      }),
    ).toBe("Smith, Jane");
  });

  it("combines same-surname couples under one surname", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "Helen Pevensie",
        secondary_guardian_name: "Roger Pevensie",
      }),
    ).toBe("Pevensie, Helen & Roger");
  });

  it("renders different-surname couples in full surname-first form", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "John Doe",
        secondary_guardian_name: "Jane Smith",
      }),
    ).toBe("Doe, John & Smith, Jane");
  });

  it("trims whitespace before parsing", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "  Helen Pevensie  ",
        secondary_guardian_name: "  Roger Pevensie  ",
      }),
    ).toBe("Pevensie, Helen & Roger");
  });

  it("uses last-space split (multi-word first names)", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "Mary Jane Watson",
      }),
    ).toBe("Watson, Mary Jane");
  });

  it("handles single-token secondary by using primary's surname", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "Helen Pevensie",
        secondary_guardian_name: "Roger",
      }),
    ).toBe("Pevensie, Helen & Roger");
  });

  it("uses secondary's surname when primary is single-token", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "Helen",
        secondary_guardian_name: "Roger Pevensie",
      }),
    ).toBe("Pevensie, Helen & Roger");
  });

  it("joins both first names when neither has a surname", () => {
    expect(
      formatHouseholdDisplay({
        primary_guardian_name: "Helen",
        secondary_guardian_name: "Roger",
      }),
    ).toBe("Helen & Roger");
  });
});

describe("extractSurname", () => {
  it("returns last token", () => {
    expect(extractSurname("Helen Pevensie")).toBe("Pevensie");
  });
  it("strips leading 'The '", () => {
    expect(extractSurname("The Pevensie Family")).toBe("Pevensie");
  });
  it("strips trailing ' Family'", () => {
    expect(extractSurname("Pevensie Family")).toBe("Pevensie");
  });
  it("returns clean single-token input as-is", () => {
    expect(extractSurname("Pevensie")).toBe("Pevensie");
  });
  it("returns empty for empty input", () => {
    expect(extractSurname("")).toBe("");
  });
});

describe("parseName", () => {
  it("splits on last space", () => {
    expect(parseName("Mary Jane Watson")).toEqual({
      first_name: "Mary Jane",
      last_name: "Watson",
    });
  });
  it("returns single-word names with empty last_name", () => {
    expect(parseName("Prince")).toEqual({
      first_name: "Prince",
      last_name: "",
    });
  });
});
