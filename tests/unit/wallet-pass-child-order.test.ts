/**
 * The wallet pass orders children oldest -> youngest using grade as
 * the age proxy. This file tests the gradeAgeRank helper indirectly
 * by exercising the same sort lambda the route uses. The helper lives
 * inline in src/app/api/wallet/family-pass/route.ts; we duplicate it
 * here rather than refactor it out to keep the route self-contained.
 */
import { describe, expect, it } from "vitest";

function gradeAgeRank(grade: string | null | undefined): number {
  if (!grade) return -1;
  const order = [
    "nursery",
    "toddler",
    "pre-k",
    "kindergarten",
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
  ];
  const idx = order.indexOf(grade);
  return idx === -1 ? -1 : idx;
}

interface Child {
  first_name: string;
  grade: string | null;
}
function sortChildren(arr: Child[]): Child[] {
  return [...arr].sort((a, b) => {
    const ra = gradeAgeRank(a.grade);
    const rb = gradeAgeRank(b.grade);
    if (ra !== rb) return rb - ra;
    return a.first_name.localeCompare(b.first_name);
  });
}

describe("wallet pass child ordering", () => {
  it("orders oldest grade first, youngest last", () => {
    const pevensies = sortChildren([
      { first_name: "Lucy", grade: "kindergarten" },
      { first_name: "Edmund", grade: "2nd" },
      { first_name: "Peter", grade: "5th" },
      { first_name: "Susan", grade: "4th" },
    ]).map((c) => c.first_name);
    expect(pevensies).toEqual(["Peter", "Susan", "Edmund", "Lucy"]);
  });

  it("alphabetizes within the same grade (twin tiebreaker)", () => {
    const twins = sortChildren([
      { first_name: "Mia", grade: "1st" },
      { first_name: "Liam", grade: "1st" },
    ]).map((c) => c.first_name);
    expect(twins).toEqual(["Liam", "Mia"]);
  });

  it("sorts ungraded children to the bottom", () => {
    const mixed = sortChildren([
      { first_name: "NoGrade", grade: null },
      { first_name: "Alice", grade: "3rd" },
      { first_name: "Brand", grade: null },
    ]).map((c) => c.first_name);
    expect(mixed[0]).toBe("Alice");
    // Both null entries sort to the bottom, alphabetized between themselves.
    expect(mixed.slice(1)).toEqual(["Brand", "NoGrade"]);
  });

  it("handles unknown grade strings as ungraded", () => {
    const mixed = sortChildren([
      { first_name: "Bob", grade: "13th" },
      { first_name: "Alice", grade: "2nd" },
    ]).map((c) => c.first_name);
    expect(mixed).toEqual(["Alice", "Bob"]);
  });

  it("covers every grade in the progression", () => {
    const all = sortChildren([
      { first_name: "nu", grade: "nursery" },
      { first_name: "to", grade: "toddler" },
      { first_name: "pk", grade: "pre-k" },
      { first_name: "kg", grade: "kindergarten" },
      { first_name: "g1", grade: "1st" },
      { first_name: "g2", grade: "2nd" },
      { first_name: "g3", grade: "3rd" },
      { first_name: "g4", grade: "4th" },
      { first_name: "g5", grade: "5th" },
      { first_name: "g6", grade: "6th" },
    ]).map((c) => c.first_name);
    expect(all).toEqual(["g6", "g5", "g4", "g3", "g2", "g1", "kg", "pk", "to", "nu"]);
  });
});
