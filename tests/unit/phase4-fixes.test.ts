/**
 * Phase 4 regression tests.
 *
 * Pins the pure-function bug fixes from Codex Run 2 Phase 4 feedback
 * (2026-05-16). Server-side / Firestore-dependent fixes are not covered here
 * — those land in handoff QA — but the easy-to-regress pure logic is locked
 * in below.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Grade normalization (kiosk register route)
//
// The kiosk visitor-registration UI emitted grade values with underscores
// ("pre_k"), but the Child / Person.child_profile schema uses hyphens
// ("pre-k"). When passed through unchanged, downstream pickers could not
// re-select the grade. Normalize before persisting.
// ---------------------------------------------------------------------------

type ChildGrade =
  | "nursery"
  | "toddler"
  | "pre-k"
  | "kindergarten"
  | "1st"
  | "2nd"
  | "3rd"
  | "4th"
  | "5th"
  | "6th"
  | "7th";

function normalizeGrade(raw: string | undefined): ChildGrade | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().replace(/_/g, "-");
  const valid: ChildGrade[] = [
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
  return valid.includes(v as ChildGrade) ? (v as ChildGrade) : undefined;
}

describe("normalizeGrade (kiosk register)", () => {
  it("rewrites pre_k to pre-k", () => {
    expect(normalizeGrade("pre_k")).toBe("pre-k");
  });

  it("passes through pre-k unchanged", () => {
    expect(normalizeGrade("pre-k")).toBe("pre-k");
  });

  it("accepts standard grade values verbatim", () => {
    expect(normalizeGrade("nursery")).toBe("nursery");
    expect(normalizeGrade("kindergarten")).toBe("kindergarten");
    expect(normalizeGrade("3rd")).toBe("3rd");
  });

  it("rejects unknown values rather than persisting garbage", () => {
    expect(normalizeGrade("grad_school")).toBeUndefined();
    expect(normalizeGrade("")).toBeUndefined();
    expect(normalizeGrade(undefined)).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(normalizeGrade("PRE_K")).toBe("pre-k");
    expect(normalizeGrade("Nursery")).toBe("nursery");
  });
});

// ---------------------------------------------------------------------------
// CSV row count (import page)
//
// Earlier UI used `csvText.split("\n").length - 1` which counted trailing
// empty newlines as data rows. A CSV with 1 data row + header + trailing
// newline reported "2 data rows", confusing testers into thinking duplicates
// existed. Replacement filters empty lines before counting.
// ---------------------------------------------------------------------------

function countDataRows(csvText: string): number {
  const nonEmpty = csvText.split("\n").filter((line) => line.trim()).length;
  return Math.max(0, nonEmpty - 1);
}

describe("countDataRows (CSV import page)", () => {
  it("reports 1 data row for header + 1 row + trailing newline (was 2)", () => {
    expect(countDataRows("header\nalice,kim\n")).toBe(1);
  });

  it("reports 1 data row for header + 1 row, no trailing newline", () => {
    expect(countDataRows("header\nalice,kim")).toBe(1);
  });

  it("reports 0 data rows for header-only CSV", () => {
    expect(countDataRows("header\n")).toBe(0);
    expect(countDataRows("header")).toBe(0);
  });

  it("reports 3 data rows for header + 3 rows", () => {
    expect(countDataRows("header\nalice\nbob\ncarol\n")).toBe(3);
  });

  it("ignores intermediate blank lines", () => {
    expect(countDataRows("header\nalice\n\n\nbob\n")).toBe(2);
  });

  it("returns 0 for empty input", () => {
    expect(countDataRows("")).toBe(0);
    expect(countDataRows("\n\n")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Songselect import: duplicate flagging
//
// `markDuplicates` returns the same preview list with `duplicate: true` set
// on songs that already exist in the church library. CCLI number is the
// strong key; title (case-insensitive) is the fallback. This is a stand-in
// for the inline logic inside SongSelectImportModal.handleFiles so the
// branching contract is easy to regression-test.
// ---------------------------------------------------------------------------

interface PreviewSongLike {
  title: string;
  ccli_number: string | null;
  duplicate?: boolean;
}

interface ExistingSongLike {
  title?: string;
  ccli_number?: string | null;
}

function markDuplicates(
  previews: PreviewSongLike[],
  existing: ExistingSongLike[],
): PreviewSongLike[] {
  const ccliSet = new Set(
    existing
      .map((s) => s.ccli_number?.trim())
      .filter((c): c is string => !!c),
  );
  const titleSet = new Set(
    existing.map((s) => s.title?.trim().toLowerCase()).filter(Boolean),
  );
  return previews.map((s) => {
    const ccliHit = s.ccli_number && ccliSet.has(s.ccli_number.trim());
    const titleHit = titleSet.has(s.title.trim().toLowerCase());
    return { ...s, duplicate: !!(ccliHit || titleHit) };
  });
}

describe("markDuplicates (songselect import preview)", () => {
  it("flags a song with a matching CCLI number", () => {
    const previews: PreviewSongLike[] = [
      { title: "Amazing Grace (new version)", ccli_number: "22025" },
    ];
    const existing: ExistingSongLike[] = [
      { title: "Amazing Grace", ccli_number: "22025" },
    ];
    expect(markDuplicates(previews, existing)[0].duplicate).toBe(true);
  });

  it("flags a song with a matching title (case-insensitive)", () => {
    const previews: PreviewSongLike[] = [
      { title: "AMAZING GRACE", ccli_number: null },
    ];
    const existing: ExistingSongLike[] = [
      { title: "Amazing Grace", ccli_number: null },
    ];
    expect(markDuplicates(previews, existing)[0].duplicate).toBe(true);
  });

  it("does not flag a unique song", () => {
    const previews: PreviewSongLike[] = [
      { title: "Brand New Song", ccli_number: "99999" },
    ];
    const existing: ExistingSongLike[] = [
      { title: "Amazing Grace", ccli_number: "22025" },
    ];
    expect(markDuplicates(previews, existing)[0].duplicate).toBe(false);
  });

  it("flags mixed batches correctly", () => {
    const previews: PreviewSongLike[] = [
      { title: "Amazing Grace", ccli_number: "22025" },
      { title: "Brand New Song", ccli_number: "99999" },
    ];
    const existing: ExistingSongLike[] = [
      { title: "Amazing Grace", ccli_number: "22025" },
    ];
    const out = markDuplicates(previews, existing);
    expect(out[0].duplicate).toBe(true);
    expect(out[1].duplicate).toBe(false);
  });
});
